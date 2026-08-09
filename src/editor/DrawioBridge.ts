import { Notice, Platform } from 'obsidian';
import { DEFAULT_EDITOR_SETTINGS_VERSION, DRAWIO_RESTRICTED_URL_PARAMS } from '../constants';
import type { DrawioSource } from '../source/DrawioSource';
import { normalizeDrawioXml, validateDrawioXml } from '../utils/xml';
import { formatDrawioEditorTitle } from './editorTitle';
import { createEditorFramePolicy, type EditorFramePolicy } from './offline/frameOrigin';
import type { OfflineEditorRuntime } from './offline/OfflineEditorRuntime';

const AUTOSAVE_WRITE_DELAY_MS = 250;
const EXIT_SNAPSHOT_TIMEOUT_MS = 5000;
const EDITOR_INIT_TIMEOUT_MS = 10000;

interface DrawioEvent {
	event?: string;
	format?: string;
	xml?: string;
	data?: string;
	error?: string;
	exit?: boolean;
	modified?: boolean;
	href?: string;
}

export interface DrawioBridgeOptions {
	settingsVersion?: string;
	compressXml?: boolean;
	onExit?: () => void;
	onSaved?: (xml: string) => void;
	onReady?: () => void;
	onError?: (error: Error) => void;
}

export class DrawioBridge {
	private iframe: HTMLIFrameElement | null = null;
	private hostWindow: Window;
	private messageHandler: ((event: MessageEvent) => void) | null = null;
	private saveTimer: number | null = null;
	private initTimer: number | null = null;
	private exitSnapshotTimer: number | null = null;
	private pendingXml: string | null = null;
	private saveChain: Promise<void> = Promise.resolve();
	private initialXml = '';
	private destroyed = false;
	private closing = false;
	private ready = false;
	private errorReported = false;
	private exitSnapshotPending = false;
	private editorPolicy: EditorFramePolicy | null = null;

	constructor(
		private container: HTMLElement,
		private source: DrawioSource,
		private dark: boolean,
		private runtime: OfflineEditorRuntime,
		private options: DrawioBridgeOptions = {},
	) {
		this.hostWindow = container.ownerDocument.defaultView ?? window;
	}

	async mount(): Promise<void> {
		this.initialXml = normalizeDrawioXml(await this.source.read());
		validateDrawioXml(this.initialXml);
		if (this.destroyed) return;
		await this.createFrame();
	}

	private async createFrame(): Promise<void> {
		this.teardownFrame();
		if (this.destroyed) return;
		this.ready = false;
		const frameSource = await this.runtime.getEditorFrameSource(this.buildParams());
		if (this.destroyed) return;
		const editorTitle = formatDrawioEditorTitle(this.runtime.isUsingLocalEditor);

		const iframe = this.container.createEl('iframe', {
			cls: 'drawio-blocks-editor-frame',
			attr: {
				title: editorTitle,
				sandbox: 'allow-scripts allow-same-origin allow-forms allow-modals',
				allow: 'clipboard-read; clipboard-write; fullscreen',
				referrerpolicy: 'no-referrer',
			},
		});
		this.iframe = iframe;
		this.editorPolicy = createEditorFramePolicy(frameSource.url, frameSource.local);

		iframe.addEventListener('error', () =>
			this.reportError(this.initializationError(frameSource.local)),
		);

		this.messageHandler = (event) => {
			const message = this.parseMessage(event.data);
			if (!message) return;
			const handshake = message.event === 'configure' || message.event === 'init';
			if (!this.editorPolicy?.accepts(event, iframe, handshake)) return;
			void this.handleMessage(message).catch((error) =>
				this.reportError(this.asError(error)),
			);
		};
		this.hostWindow.addEventListener('message', this.messageHandler);
		this.initTimer = this.hostWindow.setTimeout(
			() => this.reportError(this.initializationError(frameSource.local)),
			EDITOR_INIT_TIMEOUT_MS,
		);

		if (frameSource.srcdoc !== undefined) iframe.srcdoc = frameSource.srcdoc;
		else iframe.src = frameSource.url;
	}

	private initializationError(local: boolean): Error {
		return new Error(
			local
				? 'The local draw.io editor did not start. Re-download it in plugin settings or switch to online mode.'
				: 'Could not connect to diagrams.net. Check your network connection or enable the local editor.',
		);
	}

	private buildParams(): URLSearchParams {
		return new URLSearchParams({
			embed: '1',
			proto: 'json',
			configure: '1',
			spin: '1',
			modified: '0',
			libraries: '1',
			noSaveBtn: '1',
			saveAndExit: '0',
			noExitBtn: '0',
			dark: 'auto',
			...(Platform.isMobileApp ? { touch: '1' } : {}),
			...DRAWIO_RESTRICTED_URL_PARAMS,
		});
	}

	private parseMessage(data: unknown): DrawioEvent | null {
		try {
			const parsed: unknown = typeof data === 'string' ? JSON.parse(data) : data;
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return null;
			}
			return parsed;
		} catch {
			return null;
		}
	}

	private post(message: object): void {
		this.iframe?.contentWindow?.postMessage(
			JSON.stringify(message),
			this.editorPolicy?.targetOrigin ?? '*',
		);
	}

	private async handleMessage(message: DrawioEvent): Promise<void> {
		switch (message.event) {
			case 'configure':
				this.post({
					action: 'configure',
					config: {
						preserveViewState: true,
						suppressNewWindows: true,
						settingsName: 'drawio-blocks',
						override: false,
						compressXml: this.options.compressXml ?? false,
						version: this.options.settingsVersion ?? DEFAULT_EDITOR_SETTINGS_VERSION,
						defaultLibraries: 'general;uml;er;bpmn;flowchart;basic;arrows2',
						enabledLibraries: null,
						expandLibraries: true,
						enableCustomLibraries: false,
						inlineExtIcons: true,
					},
				});
				break;
			case 'init':
				this.post({
					action: 'load',
					xml: this.initialXml,
					autosave: 1,
					modified: 0,
					noSaveBtn: 1,
					saveAndExit: 0,
					noExitBtn: 0,
					exportProtocol: true,
					title: formatDrawioEditorTitle(this.runtime.isUsingLocalEditor),
					dark: this.dark ? 1 : 0,
				});
				this.markReady();
				break;
			case 'autosave':
				if (typeof message.xml === 'string') this.queueSave(message.xml, false);
				break;
			case 'save':
				if (typeof message.xml === 'string') {
					this.queueSave(message.xml, true);
					if (message.exit) await this.flushAndExit();
				}
				break;
			case 'exit':
				this.requestExitSnapshot();
				break;
			case 'export':
				if (
					this.exitSnapshotPending &&
					message.format === 'xml' &&
					typeof message.xml === 'string'
				) {
					this.exitSnapshotPending = false;
					if (this.exitSnapshotTimer !== null)
						this.hostWindow.clearTimeout(this.exitSnapshotTimer);
					this.exitSnapshotTimer = null;
					if (this.saveTimer !== null) this.hostWindow.clearTimeout(this.saveTimer);
					this.saveTimer = null;
					this.pendingXml = message.xml;
					await this.flushAndExit();
				}
				break;
			case 'openLink':
				if (typeof message.href === 'string') this.openSafeLink(message.href);
				break;
			default:
				if (message.error) {
					const error = new Error(`diagrams.net reported: ${message.error}`);
					if (!this.ready) this.reportError(error);
					else console.error('[drawio-blocks] diagrams.net error', message.error);
				}
				break;
		}
	}

	private markReady(): void {
		if (this.ready) return;
		this.ready = true;
		if (this.initTimer !== null) this.hostWindow.clearTimeout(this.initTimer);
		this.initTimer = null;
		this.options.onReady?.();
	}

	private queueSave(xml: string, immediate: boolean): void {
		this.pendingXml = xml;
		if (this.saveTimer !== null) this.hostWindow.clearTimeout(this.saveTimer);
		this.saveTimer = null;

		if (immediate) {
			void this.flushSaves().catch(() => undefined);
			return;
		}

		this.saveTimer = this.hostWindow.setTimeout(() => {
			this.saveTimer = null;
			void this.flushSaves().catch(() => undefined);
		}, AUTOSAVE_WRITE_DELAY_MS);
	}

	flushSaves(): Promise<void> {
		const operation = this.saveChain
			.catch(() => undefined)
			.then(async () => {
				while (this.pendingXml !== null) {
					const xml = this.pendingXml;
					this.pendingXml = null;
					try {
						validateDrawioXml(xml);
						await this.source.write(xml);
						this.options.onSaved?.(xml);
						this.post({
							action: 'status',
							message: 'Saved to Obsidian',
							modified: false,
						});
					} catch (error) {
						if (this.pendingXml === null) this.pendingXml = xml;
						const saveError = this.asError(error);
						console.error('[drawio-blocks] save failed', saveError);
						new Notice(`draw.io Blocks: ${saveError.message}`, 8000);
						this.post({
							action: 'status',
							message: `Save failed: ${saveError.message}`,
							modified: true,
						});
						throw saveError;
					}
				}
			});
		this.saveChain = operation;
		return operation;
	}

	private requestExitSnapshot(): void {
		if (this.destroyed || this.closing || this.exitSnapshotPending) return;
		this.exitSnapshotPending = true;
		this.post({
			action: 'status',
			message: 'Saving before exit…',
			modified: true,
		});
		this.post({ action: 'export', format: 'xml' });
		this.exitSnapshotTimer = this.hostWindow.setTimeout(() => {
			if (!this.exitSnapshotPending || this.destroyed) return;
			this.exitSnapshotPending = false;
			this.exitSnapshotTimer = null;
			const message = 'Could not confirm the latest diagram state. The editor was kept open.';
			new Notice(`draw.io Blocks: ${message}`, 8000);
			this.post({ action: 'status', message, modified: true });
		}, EXIT_SNAPSHOT_TIMEOUT_MS);
	}

	private async flushAndExit(): Promise<void> {
		if (this.closing) return;
		this.closing = true;
		if (this.saveTimer !== null) {
			this.hostWindow.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		try {
			await this.flushSaves();
			this.options.onExit?.();
		} catch {
			this.closing = false;
		}
	}

	private openSafeLink(href: string): void {
		try {
			const url = new URL(href);
			if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return;
			this.hostWindow.open(url.toString(), '_blank', 'noopener,noreferrer');
		} catch {
			// Ignore malformed or relative links from diagram content.
		}
	}

	private reportError(error: Error): void {
		if (this.destroyed || this.errorReported) return;
		this.errorReported = true;
		if (this.initTimer !== null) this.hostWindow.clearTimeout(this.initTimer);
		this.initTimer = null;
		if (this.options.onError) this.options.onError(error);
		else new Notice(`draw.io Blocks: ${error.message}`, 8000);
	}

	private asError(error: unknown): Error {
		return error instanceof Error ? error : new Error(String(error));
	}

	private teardownFrame(): void {
		if (this.initTimer !== null) this.hostWindow.clearTimeout(this.initTimer);
		this.initTimer = null;
		if (this.messageHandler)
			this.hostWindow.removeEventListener('message', this.messageHandler);
		this.messageHandler = null;
		this.iframe?.remove();
		this.iframe = null;
		this.editorPolicy = null;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (this.saveTimer !== null) this.hostWindow.clearTimeout(this.saveTimer);
		if (this.initTimer !== null) this.hostWindow.clearTimeout(this.initTimer);
		if (this.exitSnapshotTimer !== null) this.hostWindow.clearTimeout(this.exitSnapshotTimer);
		this.saveTimer = null;
		this.initTimer = null;
		this.exitSnapshotTimer = null;
		this.exitSnapshotPending = false;
		void this.flushSaves().catch(() => undefined);
		this.teardownFrame();
	}
}
