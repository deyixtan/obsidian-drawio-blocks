import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { strFromU8, strToU8, zipSync } from 'fflate';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archiveArgumentIndex = process.argv.indexOf('--archive');
const syntheticFiles = {
	'index.html': strToU8(
		'<!doctype html><html><head><title>draw.io test</title><link rel="stylesheet" type="text/css" href="styles/grapheditor.css"><link rel="stylesheet" media="(forced-colors: active)" href="styles/high-contrast.css"><script src="js/bootstrap.js"></script></head><body><script src="js/main.js"></script></body></html>',
	),
	'js/bootstrap.js': strToU8(
		'var urlParams = (function(){return {};})();if (!mxIsElectron) { window.redirected = true; }',
	),
	'js/PreConfig.js': strToU8(
		[
			'window.DRAWIO_BASE_URL = null;',
			'window.DRAWIO_VIEWER_URL = null;',
			'window.DRAWIO_LIGHTBOX_URL = null;',
		].join('\n'),
	),
	'js/app.min.js': strToU8(
		'if(("jgraph.github.io"==window.location.hostname)&&(lang=navigator.language)){}',
	),
	'js/main.js': strToU8('window.EditorLoaded=true;'),
	'mxgraph/css/common.css': strToU8('div.mxPopupMenu{position:absolute}'),
	'styles/grapheditor.css': strToU8('body{margin:0}'),
	'styles/high-contrast.css': strToU8('body{outline:1px solid}'),
	'META-INF/server-only.txt': strToU8('ignored'),
	'WEB-INF/server-only.txt': strToU8('ignored'),
	'js/debug.map': strToU8('ignored'),
};
let archive;
let fixtureName;
let testConfig;

if (archiveArgumentIndex >= 0) {
	const archiveArgument = process.argv[archiveArgumentIndex + 1];
	if (!archiveArgument) throw new Error('--archive requires a path to draw.war.');

	archive = new Uint8Array(await readFile(path.resolve(process.cwd(), archiveArgument)));
	testConfig = JSON.parse(await readFile(path.join(projectRoot, 'drawio.config.json'), 'utf8'));
	fixtureName = `draw.io ${testConfig.version}`;
} else {
	archive = zipSync(syntheticFiles, { level: 6 });
	const archiveHash = createHash('sha256').update(archive).digest('hex');
	testConfig = {
		version: '9.9.9',
		releaseUrl: 'https://example.test/draw.war',
		latestReleaseUrl: 'https://api.example.test/releases/latest',
		sha256: archiveHash,
		bundleRevision: 7,
		minimumFileCount: 8,
	};
	fixtureName = 'synthetic draw.io fixture';
}

const installationRoot = 'plugin/drawio';

const compilation = await esbuild.build({
	entryPoints: [path.join(projectRoot, 'src', 'editor', 'offline', 'OfflineEditorRuntime.ts')],
	bundle: true,
	format: 'esm',
	platform: 'browser',
	write: false,
	loader: { '.txt': 'text' },
	plugins: [
		{
			name: 'offline-runtime-verifier',
			setup(build) {
				build.onResolve({ filter: /^obsidian$/ }, () => ({
					path: 'obsidian',
					namespace: 'offline-runtime-verifier',
				}));
				build.onLoad({ filter: /.*/, namespace: 'offline-runtime-verifier' }, () => ({
					contents: `
						export const normalizePath = (value) => value.replaceAll('\\\\', '/').replace(/\\/{2,}/g, '/').replace(/^\\.\\//, '').replace(/\\/$/, '');
						export const requestUrl = async (request) => {
							if (request.url === globalThis.__drawioLatestReleaseUrl) {
								globalThis.__drawioUpdateRequestCount += 1;
								return { status: globalThis.__drawioUpdateStatus, json: { tag_name: globalThis.__drawioLatestTag } };
							}
							globalThis.__drawioRequestCount += 1;
							return { status: globalThis.__drawioStatus, arrayBuffer: globalThis.__drawioArchive };
						};
					`,
					loader: 'js',
				}));
				build.onLoad({ filter: /drawio\.config\.json$/ }, () => ({
					contents: JSON.stringify(testConfig),
					loader: 'json',
				}));
			},
		},
	],
});
const output = compilation.outputFiles?.[0];

if (!output) throw new Error('Could not compile the local editor runtime verifier.');

const compiledModule = await import(
	`data:text/javascript;base64,${Buffer.from(output.contents).toString('base64')}`
);
const { OfflineEditorRuntime } = compiledModule;

if (typeof OfflineEditorRuntime !== 'function') {
	throw new Error('The local editor runtime did not compile correctly.');
}

globalThis.crypto ??= webcrypto;
globalThis.window ??= globalThis;
globalThis.__drawioArchive = exactArrayBuffer(archive);
globalThis.__drawioLatestReleaseUrl = testConfig.latestReleaseUrl;
globalThis.__drawioLatestTag = archiveArgumentIndex >= 0 ? `v${testConfig.version}` : 'v9.9.10';
globalThis.__drawioRequestCount = 0;
globalThis.__drawioStatus = 200;
globalThis.__drawioUpdateRequestCount = 0;
globalThis.__drawioUpdateStatus = 200;

const files = new Set([
	'plugin',
	'plugin/drawio',
	'plugin/drawio/8.8.8-1',
	'plugin/drawio/8.8.8-1/.installed',
]);
const textFiles = new Map([['plugin/drawio/8.8.8-1/.installed', '8.8.8-1-deadbeefdeadbeef']]);
const binaryFiles = new Map();

function exactArrayBuffer(value) {
	return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

const adapter = {
	async exists(filename) {
		return files.has(filename);
	},
	async mkdir(filename) {
		const parent = filename.slice(0, filename.lastIndexOf('/'));
		if (parent && !files.has(parent)) {
			throw new Error(`Runtime tried to create ${filename} before ${parent}.`);
		}
		files.add(filename);
	},
	async read(filename) {
		const value = textFiles.get(filename);
		if (value !== undefined) return value;
		const binary = binaryFiles.get(filename);
		if (binary !== undefined) return strFromU8(binary);
		throw new Error(`Missing mock text file: ${filename}`);
	},
	async write(filename, value) {
		files.add(filename);
		textFiles.set(filename, value);
	},
	async writeBinary(filename, value) {
		files.add(filename);
		binaryFiles.set(filename, new Uint8Array(value));
	},
	async list(directory) {
		const prefix = `${directory}/`;
		const folders = Array.from(files).filter(
			(filename) =>
				filename.startsWith(prefix) &&
				!filename.slice(prefix.length).includes('/') &&
				!textFiles.has(filename) &&
				!binaryFiles.has(filename),
		);
		return { files: [], folders };
	},
	async rmdir(directory) {
		for (const filename of Array.from(files)) {
			if (filename === directory || filename.startsWith(`${directory}/`)) {
				files.delete(filename);
				textFiles.delete(filename);
				binaryFiles.delete(filename);
			}
		}
	},
	getResourcePath(filename) {
		return `app://vault/${filename}`;
	},
};
const app = { vault: { adapter } };
const params = new URLSearchParams({ embed: '1', proto: 'json' });
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', {
	configurable: true,
	value: { onLine: false },
});
const disconnectedRuntime = new OfflineEditorRuntime(app, 'plugin');
await disconnectedRuntime.getEditorUrl(params).then(
	() => {
		throw new Error('Online mode opened while the browser reported no network.');
	},
	(error) => {
		if (!(error instanceof Error) || !error.message.includes('No network connection')) {
			throw error;
		}
	},
);
await disconnectedRuntime.checkForLocalEditorUpdates().then(
	() => {
		throw new Error('Update check ran while the browser reported no network.');
	},
	(error) => {
		if (!(error instanceof Error) || !error.message.includes('No network connection')) {
			throw error;
		}
	},
);
if (globalThis.__drawioUpdateRequestCount !== 0) {
	throw new Error('Offline update check made a network request.');
}
if (navigatorDescriptor) {
	Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
} else {
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: { onLine: true },
	});
}

const runtime = new OfflineEditorRuntime(app, 'plugin');
const onlineUrl = await runtime.getEditorUrl(params);

if (onlineUrl !== 'https://embed.diagrams.net/?embed=1&proto=json') {
	throw new Error(`The runtime returned an invalid online URL: ${onlineUrl}`);
}
if (globalThis.__drawioRequestCount !== 0) {
	throw new Error('Online mode downloaded local editor files.');
}

runtime.setUseLocalEditor(true);
await runtime.getEditorUrl(params).then(
	() => {
		throw new Error('Local mode opened before the editor was downloaded.');
	},
	(error) => {
		if (!(error instanceof Error) || !error.message.includes('Download')) throw error;
	},
);

const phases = [];
await runtime.downloadLocalEditor((phase) => phases.push(phase));

if (phases.join(',') !== 'downloading,verifying,installing') {
	throw new Error(`Unexpected local editor installation phases: ${phases.join(',')}`);
}
if (globalThis.__drawioRequestCount !== 1) {
	throw new Error(`Expected one editor download, got ${globalThis.__drawioRequestCount}.`);
}
if (!(await runtime.isLocalEditorInstalled())) {
	throw new Error('The downloaded local editor was not marked as installed.');
}
if (files.has('plugin/drawio/8.8.8-1')) {
	throw new Error('The local editor runtime kept a superseded generated installation.');
}

const localUrl = await runtime.getEditorUrl(params);
if (localUrl !== `app://vault/${installationRoot}/index.html?embed=1&proto=json`) {
	throw new Error(`The runtime returned an invalid local URL: ${localUrl}`);
}

const fallbackSource = await runtime.getEditorFrameSource(params);
if (
	fallbackSource.url !== 'about:srcdoc' ||
	!fallbackSource.local ||
	!fallbackSource.srcdoc?.includes(`<base href="app://vault/${installationRoot}/index.html">`) ||
	!fallbackSource.srcdoc.includes('data-drawio-local="styles/grapheditor.css"') ||
	!fallbackSource.srcdoc.includes('data-drawio-local="styles/high-contrast.css"') ||
	!fallbackSource.srcdoc.includes('data-drawio-local="js/bootstrap.js"') ||
	!fallbackSource.srcdoc.includes('data-drawio-local="mxgraph/css/common.css"') ||
	!/div\.mxPopupMenu\s*\{[^}]*\bposition\s*:\s*absolute\b/s.test(fallbackSource.srcdoc) ||
	!fallbackSource.srcdoc.includes('data-drawio-local="viewport"') ||
	fallbackSource.srcdoc.includes('<link rel="stylesheet"') ||
	!fallbackSource.srcdoc.includes('window.DRAWIO_EMBED_PARAMS=') ||
	!fallbackSource.srcdoc.includes('window.mxLoadStylesheets=false') ||
	!fallbackSource.srcdoc.includes('!window.DRAWIO_OBSIDIAN_LOCAL')
) {
	throw new Error('The runtime did not create a complete local srcdoc editor.');
}

const markerPath = `${installationRoot}/.installed`;
const currentMarker = textFiles.get(markerPath);
if (typeof currentMarker !== 'string') {
	throw new Error('The runtime did not write the local editor marker.');
}
await adapter.write(markerPath, '8.8.8-1-deadbeefdeadbeef');
if (await runtime.isLocalEditorInstalled()) {
	throw new Error('An older local editor was reported as the current bundled version.');
}
if (!(await runtime.hasLocalEditorInstallation())) {
	throw new Error('An older verified local editor was not recognized as available.');
}
if ((await runtime.getEditorUrl(params)) !== localUrl) {
	throw new Error('An older verified local editor could not remain active before updating.');
}
await adapter.write(markerPath, currentMarker);

const updateInfo = await runtime.checkForLocalEditorUpdates();
if (globalThis.__drawioUpdateRequestCount !== 1) {
	throw new Error('The local editor update check did not make exactly one explicit request.');
}
if (updateInfo.installedVersion !== testConfig.version || !updateInfo.installedIsCurrent) {
	throw new Error('The update check did not report the installed local editor version.');
}
if (updateInfo.upstreamUpdateAvailable !== archiveArgumentIndex < 0) {
	throw new Error('The update check compared draw.io versions incorrectly.');
}

const preConfig = strFromU8(binaryFiles.get(`${installationRoot}/js/PreConfig.js`));
const appSource = strFromU8(binaryFiles.get(`${installationRoot}/js/app.min.js`));

if (
	!preConfig.includes('window.DRAWIO_BUNDLED = true;') ||
	!preConfig.includes("window.DRAWIO_BASE_URL = '.';") ||
	!appSource.includes('window.DRAWIO_BUNDLED')
) {
	throw new Error('The downloaded editor did not receive the local deployment patches.');
}
for (const ignored of [
	`${installationRoot}/META-INF/server-only.txt`,
	`${installationRoot}/WEB-INF/server-only.txt`,
	`${installationRoot}/js/debug.map`,
]) {
	if (files.has(ignored)) throw new Error(`The runtime extracted excluded file ${ignored}.`);
}
for (const license of [
	`${installationRoot}/THIRD_PARTY_LICENSES/drawio-LICENSE.txt`,
	`${installationRoot}/THIRD_PARTY_LICENSES/fflate-LICENSE.txt`,
]) {
	if (!files.has(license)) throw new Error(`The runtime did not install ${license}.`);
}

await runtime.downloadLocalEditor();
if (globalThis.__drawioRequestCount !== 1) {
	throw new Error('The runtime downloaded an already-installed local editor again.');
}

const installedBinaryCount = binaryFiles.size;
await runtime.removeLocalEditor();
if (await runtime.isLocalEditorInstalled()) {
	throw new Error('The runtime did not remove the local editor.');
}
if (await runtime.hasLocalEditorInstallation()) {
	throw new Error('The removed local editor was still reported as available.');
}

const writesBeforeIntegrityTest = binaryFiles.size;
const corrupted = archive.slice();
corrupted[corrupted.length - 1] ^= 1;
globalThis.__drawioArchive = exactArrayBuffer(corrupted);
const integrityRuntime = new OfflineEditorRuntime(app, 'plugin');
await integrityRuntime.downloadLocalEditor().then(
	() => {
		throw new Error('The runtime installed an editor with an invalid checksum.');
	},
	(error) => {
		if (!(error instanceof Error) || !error.message.includes('Checksum mismatch')) throw error;
	},
);
if (binaryFiles.size !== writesBeforeIntegrityTest) {
	throw new Error('The runtime wrote files before rejecting an invalid checksum.');
}

runtime.setUseLocalEditor(false);
if ((await runtime.getEditorUrl(params)) !== onlineUrl) {
	throw new Error('The runtime did not switch back to online mode.');
}
runtime.destroy();
await runtime.getEditorUrl(params).then(
	() => {
		throw new Error('A stopped editor runtime accepted a new request.');
	},
	(error) => {
		if (!(error instanceof Error) || !error.message.includes('stopped')) throw error;
	},
);

process.stdout.write(
	`Verified ${fixtureName}: ${installedBinaryCount} flat local files, SHA-256 check, compatible update state, extraction, removal, and online toggle\n`,
);
