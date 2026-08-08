import { normalizePath, requestUrl, type App } from 'obsidian';
import { Unzip, UnzipInflate } from 'fflate';
import drawioConfig from '../../../drawio.config.json';
import drawioLicense from '../../../licenses/drawio-LICENSE.txt';
import fflateLicense from '../../../licenses/fflate-LICENSE.txt';
import { DRAWIO_EDITOR_URL } from '../../constants';

const INSTALLATION_MARKER = '.installed';
const EXTRACTION_CHUNK_SIZE = 1024 * 1024;

export type LocalEditorInstallPhase = 'downloading' | 'verifying' | 'installing';

export interface EditorFrameSource {
	local: boolean;
	srcdoc?: string;
	url: string;
}

export interface LocalEditorUpdateInfo {
	bundledVersion: string;
	installedIsCurrent: boolean;
	installedVersion: string | null;
	latestVersion: string;
	upstreamUpdateAvailable: boolean;
}

function expectedInstallationId(): string {
	return `${drawioConfig.version}-${drawioConfig.bundleRevision}-${drawioConfig.sha256.slice(0, 16)}`;
}

function shouldInstall(filename: string): boolean {
	return (
		filename.length > 0 &&
		!filename.endsWith('/') &&
		!filename.startsWith('META-INF/') &&
		!filename.startsWith('WEB-INF/') &&
		!filename.endsWith('.map')
	);
}

function validateArchivePath(filename: string): void {
	if (
		filename.length > 512 ||
		filename.startsWith('/') ||
		filename.includes('\\') ||
		filename.includes('\0') ||
		filename.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
	) {
		throw new Error(`Unsafe path in the draw.io archive: ${filename}`);
	}
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
	if (chunks.length === 1) return chunks[0] ?? new Uint8Array();
	const result = new Uint8Array(size);
	let offset = 0;

	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return result;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

function patchPreConfig(data: Uint8Array): Uint8Array {
	let source = new TextDecoder().decode(data);
	const replacements: ReadonlyArray<readonly [string, string]> = [
		['window.DRAWIO_BASE_URL = null;', "window.DRAWIO_BASE_URL = '.';"],
		['window.DRAWIO_VIEWER_URL = null;', "window.DRAWIO_VIEWER_URL = 'js/viewer.min.js';"],
		['window.DRAWIO_LIGHTBOX_URL = null;', "window.DRAWIO_LIGHTBOX_URL = '.';"],
	];

	for (const [from, to] of replacements) {
		if (!source.includes(from)) {
			throw new Error(`Could not configure draw.io PreConfig.js: missing ${from}`);
		}

		source = source.replace(from, to);
	}

	return new TextEncoder().encode(
		`/* Modified by draw.io Blocks: deployment URLs below resolve to downloaded local assets. */\nwindow.DRAWIO_BUNDLED = true;\n${source}`,
	);
}

function patchApp(data: Uint8Array): Uint8Array {
	let source = new TextDecoder().decode(data);
	const from = '"jgraph.github.io"==window.location.hostname)&&(lang=navigator.language';
	const to =
		'"jgraph.github.io"==window.location.hostname||!0===window.DRAWIO_BUNDLED)&&(lang=navigator.language';

	if (!source.includes(from)) {
		throw new Error('Could not configure draw.io app.min.js language detection.');
	}

	source = source.replace(from, to);
	return new TextEncoder().encode(
		`/* Modified by draw.io Blocks: downloaded deployments retain browser language detection. */\n${source}`,
	);
}

function prepareAsset(filename: string, data: Uint8Array): Uint8Array {
	if (filename === 'js/PreConfig.js') return patchPreConfig(data);
	if (filename === 'js/app.min.js') return patchApp(data);
	return data;
}

async function sha256(data: Uint8Array): Promise<string> {
	if (!window.crypto?.subtle) {
		throw new Error('This device does not provide SHA-256 verification.');
	}

	const digest = new Uint8Array(
		await window.crypto.subtle.digest('SHA-256', exactArrayBuffer(data)),
	);
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function compareDrawioVersions(left: string, right: string): number {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);
	const length = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < length; index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}

	return 0;
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeStyleText(value: string): string {
	return value.replace(/<\/style/gi, '<\\/style');
}

function escapeScriptText(value: string): string {
	return value.replace(/<\/script/gi, '<\\/script');
}

function patchBootstrapForLocalDocument(data: string): string {
	let source = data;
	const replacements: ReadonlyArray<readonly [string, string]> = [
		[
			'var urlParams = (function()',
			'var urlParams = window.DRAWIO_EMBED_PARAMS || (function()',
		],
		['if (!mxIsElectron)', 'if (!mxIsElectron && !window.DRAWIO_OBSIDIAN_LOCAL)'],
	];

	for (const [from, to] of replacements) {
		if (!source.includes(from)) {
			throw new Error(`Local draw.io bootstrap is missing ${from}.`);
		}

		source = source.replace(from, to);
	}

	return source;
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export class OfflineEditorRuntime {
	private downloadOperation: Promise<void> | null = null;
	private readonly pluginDirectory: string;
	private destroyed = false;
	private useLocalEditor: boolean;

	constructor(
		private readonly app: App,
		pluginDirectory: string,
		useLocalEditor = false,
	) {
		this.pluginDirectory = normalizePath(pluginDirectory);
		this.useLocalEditor = useLocalEditor;
	}

	get localEditorVersion(): string {
		return drawioConfig.version;
	}

	get isUsingLocalEditor(): boolean {
		return this.useLocalEditor;
	}

	setUseLocalEditor(value: boolean): void {
		this.useLocalEditor = value;
	}

	async getEditorUrl(params: URLSearchParams): Promise<string> {
		if (this.destroyed) throw new Error('The draw.io editor runtime has stopped.');

		if (!this.useLocalEditor) {
			if (window.navigator.onLine === false) {
				throw new Error(
					'No network connection. Reconnect or enable the downloaded local editor to render diagrams.',
				);
			}

			return this.withParams(DRAWIO_EDITOR_URL, params);
		}

		const indexPath = this.getIndexPath();

		if (!(await this.hasLocalEditorInstallation())) {
			throw new Error(
				'Local editor files are unavailable. Download them in draw.io Blocks settings or switch to the online editor.',
			);
		}

		return this.withParams(this.app.vault.adapter.getResourcePath(indexPath), params);
	}

	async getEditorFrameSource(params: URLSearchParams): Promise<EditorFrameSource> {
		const url = await this.getEditorUrl(params);

		if (!this.useLocalEditor) return { local: false, url };

		return {
			local: true,
			srcdoc: await this.createLocalEditorDocument(params),
			url: 'about:srcdoc',
		};
	}

	async isLocalEditorInstalled(): Promise<boolean> {
		const adapter = this.app.vault.adapter;
		const markerPath = this.getMarkerPath();

		try {
			return (
				(await adapter.exists(this.getIndexPath())) &&
				(await adapter.exists(markerPath)) &&
				(await adapter.read(markerPath)).trim() === expectedInstallationId()
			);
		} catch {
			return false;
		}
	}

	async hasLocalEditorInstallation(): Promise<boolean> {
		return (await this.getInstalledLocalEditorVersion()) !== null;
	}

	async getInstalledLocalEditorVersion(): Promise<string | null> {
		const adapter = this.app.vault.adapter;

		try {
			if (!(await adapter.exists(this.getIndexPath()))) return null;
			if (!(await adapter.exists(this.getMarkerPath()))) return null;
			const marker = (await adapter.read(this.getMarkerPath())).trim();
			return /^(\d+\.\d+\.\d+)-\d+-[a-f\d]{16}$/.exec(marker)?.[1] ?? null;
		} catch {
			return null;
		}
	}

	async checkForLocalEditorUpdates(): Promise<LocalEditorUpdateInfo> {
		if (this.destroyed) throw new Error('The draw.io editor runtime has stopped.');
		if (window.navigator.onLine === false) {
			throw new Error('No network connection. Reconnect before checking for updates.');
		}

		const response = await requestUrl({
			url: drawioConfig.latestReleaseUrl,
			method: 'GET',
			headers: { Accept: 'application/vnd.github+json' },
			throw: false,
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`Update check returned HTTP ${response.status}.`);
		}

		const payload: unknown = response.json;
		const tagName =
			payload !== null && typeof payload === 'object' && 'tag_name' in payload
				? (payload as { tag_name?: unknown }).tag_name
				: null;

		if (typeof tagName !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(tagName)) {
			throw new Error('GitHub returned an invalid draw.io release version.');
		}

		const latestVersion = tagName.replace(/^v/, '');
		const installedVersion = await this.getInstalledLocalEditorVersion();

		return {
			bundledVersion: drawioConfig.version,
			installedIsCurrent: await this.isLocalEditorInstalled(),
			installedVersion,
			latestVersion,
			upstreamUpdateAvailable: compareDrawioVersions(latestVersion, drawioConfig.version) > 0,
		};
	}

	downloadLocalEditor(onPhase?: (phase: LocalEditorInstallPhase) => void): Promise<void> {
		if (this.destroyed) {
			return Promise.reject(new Error('The draw.io editor runtime has stopped.'));
		}

		if (!this.downloadOperation) {
			this.downloadOperation = this.install(onPhase).finally(() => {
				this.downloadOperation = null;
			});
		}

		return this.downloadOperation;
	}

	async removeLocalEditor(): Promise<void> {
		if (this.downloadOperation) {
			throw new Error('Wait for the local editor download to finish before removing it.');
		}

		const adapter = this.app.vault.adapter;
		const currentRoot = this.getInstallationRoot();

		if (await adapter.exists(currentRoot)) {
			await adapter.rmdir(currentRoot, true);
		}
	}

	private withParams(baseUrl: string, params: URLSearchParams): string {
		const query = params.toString();
		if (!query) return baseUrl;
		return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query}`;
	}

	private getInstallationRoot(): string {
		return normalizePath(`${this.pluginDirectory}/drawio`);
	}

	private getIndexPath(): string {
		return normalizePath(`${this.getInstallationRoot()}/index.html`);
	}

	private getMarkerPath(): string {
		return normalizePath(`${this.getInstallationRoot()}/${INSTALLATION_MARKER}`);
	}

	private async createLocalEditorDocument(params: URLSearchParams): Promise<string> {
		const adapter = this.app.vault.adapter;
		const root = this.getInstallationRoot();
		const indexUrl = adapter.getResourcePath(this.getIndexPath());
		let html = await adapter.read(this.getIndexPath());
		const bootstrapExpression =
			/<script\b[^>]*\bsrc=(["'])js\/bootstrap\.js\1[^>]*><\/script>/i;

		if (!bootstrapExpression.test(html)) {
			throw new Error('Local draw.io index is missing js/bootstrap.js.');
		}

		const bootstrapSource = patchBootstrapForLocalDocument(
			await adapter.read(normalizePath(`${root}/js/bootstrap.js`)),
		);
		html = html.replace(
			bootstrapExpression,
			`<script data-drawio-local="js/bootstrap.js">${escapeScriptText(bootstrapSource)}</script>`,
		);
		const stylesheets: ReadonlyArray<{
			href: string;
			media?: string;
			path: string;
		}> = [
			{
				href: 'styles/grapheditor.css',
				path: normalizePath(`${root}/styles/grapheditor.css`),
			},
			{
				href: 'styles/high-contrast.css',
				media: '(forced-colors: active)',
				path: normalizePath(`${root}/styles/high-contrast.css`),
			},
		];

		for (const stylesheet of stylesheets) {
			const expression = new RegExp(
				`<link\\b[^>]*\\bhref=(["'])${escapeRegExp(stylesheet.href)}\\1[^>]*>`,
				'i',
			);

			if (!expression.test(html)) {
				throw new Error(`Local draw.io index is missing ${stylesheet.href}.`);
			}

			const css = escapeStyleText(await adapter.read(stylesheet.path));
			const media = stylesheet.media
				? ` media="${escapeHtmlAttribute(stylesheet.media)}"`
				: '';
			html = html.replace(
				expression,
				`<style data-drawio-local="${escapeHtmlAttribute(stylesheet.href)}"${media}>${css}</style>`,
			);
		}

		const head = /<head(?:\s[^>]*)?>/i;

		if (!head.test(html)) throw new Error('Local draw.io index is missing its head element.');

		const serializedParams = JSON.stringify(Object.fromEntries(params.entries())).replaceAll(
			'<',
			'\\u003c',
		);
		const commonCss = escapeStyleText(
			await adapter.read(normalizePath(`${root}/mxgraph/css/common.css`)),
		);
		const bootstrap =
			`<base href="${escapeHtmlAttribute(indexUrl)}">` +
			`<style data-drawio-local="mxgraph/css/common.css">${commonCss}</style>` +
			'<style data-drawio-local="viewport">html,body{width:100%;height:100%;margin:0;overflow:hidden}</style>' +
			`<script>window.DRAWIO_OBSIDIAN_LOCAL=true;window.mxLoadStylesheets=false;window.DRAWIO_EMBED_PARAMS=${serializedParams};</script>`;

		return html.replace(head, (openingTag) => `${openingTag}${bootstrap}`);
	}

	private async install(onPhase?: (phase: LocalEditorInstallPhase) => void): Promise<void> {
		if (await this.isLocalEditorInstalled()) return;

		let extractionStarted = false;

		try {
			onPhase?.('downloading');
			const response = await requestUrl({
				url: drawioConfig.releaseUrl,
				method: 'GET',
				throw: false,
			});

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Download returned HTTP ${response.status}.`);
			}

			const archive = new Uint8Array(response.arrayBuffer);
			onPhase?.('verifying');
			const actualHash = await sha256(archive);

			if (actualHash !== drawioConfig.sha256) {
				throw new Error(
					`Checksum mismatch: expected ${drawioConfig.sha256}, received ${actualHash}.`,
				);
			}

			if (this.destroyed) throw new Error('Editor installation was stopped.');
			onPhase?.('installing');
			const root = this.getInstallationRoot();
			const adapter = this.app.vault.adapter;

			if (await adapter.exists(root)) await adapter.rmdir(root, true);
			extractionStarted = true;
			await this.extractArchive(archive, root);
			await adapter.write(this.getMarkerPath(), expectedInstallationId());
		} catch (error) {
			if (extractionStarted) {
				try {
					const root = this.getInstallationRoot();
					if (await this.app.vault.adapter.exists(root)) {
						await this.app.vault.adapter.rmdir(root, true);
					}
				} catch {
					// The missing marker prevents a partial installation from being used.
				}
			}

			throw new Error(
				`Could not install local draw.io ${drawioConfig.version}: ${asError(error).message}`,
			);
		}
	}

	private async extractArchive(archive: Uint8Array, root: string): Promise<void> {
		const knownDirectories = new Set<string>();
		const installedFiles = new Set<string>();
		const requiredFiles = new Set([
			'index.html',
			'js/PreConfig.js',
			'js/app.min.js',
			'mxgraph/css/common.css',
		]);
		const pendingWrites = new Set<Promise<void>>();
		let archiveError: Error | null = null;

		const unzipper = new Unzip((file) => {
			const filename = file.name;

			if (!shouldInstall(filename)) return;

			try {
				validateArchivePath(filename);
				if (installedFiles.has(filename)) {
					throw new Error(`Duplicate path in the draw.io archive: ${filename}`);
				}
				installedFiles.add(filename);
			} catch (error) {
				archiveError = asError(error);
				return;
			}

			const chunks: Uint8Array[] = [];
			let size = 0;

			file.ondata = (error, chunk, final) => {
				if (archiveError) return;
				if (error) {
					archiveError = asError(error);
					return;
				}

				if (chunk.byteLength > 0) {
					const copy = new Uint8Array(chunk.byteLength);
					copy.set(chunk);
					chunks.push(copy);
					size += copy.byteLength;
				}

				if (!final) return;

				const writing = this.writeAsset(
					root,
					filename,
					prepareAsset(filename, concatChunks(chunks, size)),
					knownDirectories,
				).catch((writeError: unknown) => {
					archiveError = asError(writeError);
				});
				pendingWrites.add(writing);
				void writing.finally(() => pendingWrites.delete(writing));
				requiredFiles.delete(filename);
			};

			try {
				file.start();
			} catch (error) {
				archiveError = asError(error);
			}
		});
		unzipper.register(UnzipInflate);

		for (let offset = 0; offset < archive.byteLength; offset += EXTRACTION_CHUNK_SIZE) {
			if (this.destroyed) throw new Error('Editor installation was stopped.');
			const end = Math.min(offset + EXTRACTION_CHUNK_SIZE, archive.byteLength);
			unzipper.push(archive.subarray(offset, end), end === archive.byteLength);
			await Promise.all(Array.from(pendingWrites));
			if (archiveError) throw asError(archiveError);
			await yieldToEventLoop();
		}

		await Promise.all(Array.from(pendingWrites));
		if (archiveError) throw asError(archiveError);
		if (requiredFiles.size > 0) {
			throw new Error(
				`The draw.io archive is missing ${Array.from(requiredFiles).join(', ')}.`,
			);
		}
		if (installedFiles.size < drawioConfig.minimumFileCount) {
			throw new Error(
				`The draw.io archive contained only ${installedFiles.size} usable files.`,
			);
		}

		const encoder = new TextEncoder();
		await this.writeAsset(
			root,
			'THIRD_PARTY_LICENSES/drawio-LICENSE.txt',
			encoder.encode(drawioLicense),
			knownDirectories,
		);
		await this.writeAsset(
			root,
			'THIRD_PARTY_LICENSES/fflate-LICENSE.txt',
			encoder.encode(fflateLicense),
			knownDirectories,
		);
	}

	private async writeAsset(
		root: string,
		filename: string,
		data: Uint8Array,
		knownDirectories: Set<string>,
	): Promise<void> {
		const outputPath = normalizePath(`${root}/${filename}`);
		await this.ensureParentDirectories(outputPath, knownDirectories);
		await this.app.vault.adapter.writeBinary(outputPath, exactArrayBuffer(data));
	}

	private async ensureParentDirectories(
		filename: string,
		knownDirectories: Set<string>,
	): Promise<void> {
		const adapter = this.app.vault.adapter;
		const parts = filename.split('/');
		parts.pop();
		let current = '';

		for (const part of parts) {
			current = current ? `${current}/${part}` : part;

			if (knownDirectories.has(current)) continue;
			if (!(await adapter.exists(current))) await adapter.mkdir(current);
			knownDirectories.add(current);
		}
	}

	destroy(): void {
		this.destroyed = true;
	}
}
