import { DRAWIO_RESTRICTED_URL_PARAMS, EMPTY_DRAWIO_XML } from '../constants';
import { createEditorFramePolicy, type EditorFramePolicy } from '../editor/offline/frameOrigin';
import type { OfflineEditorRuntime } from '../editor/offline/OfflineEditorRuntime';

interface ExportRequest {
	xml: string;
	dark: boolean;
	local: boolean;
	deadlineTimer: number | null;
	resolve: (value: string) => void;
	reject: (error: Error) => void;
}
interface DrawioMessage {
	event?: string;
	data?: string;
	error?: string;
}

const RENDERER_INIT_TIMEOUT_MS = 10000;
const EXPORT_TIMEOUT_MS = 10000;
const REQUEST_DEADLINE_MS = 15000;

export class PreviewExporter {
	private container: HTMLElement | null = null;
	private iframe: HTMLIFrameElement | null = null;
	private win: Window = window;
	private handler: ((event: MessageEvent) => void) | null = null;
	private ready = false;
	private active: ExportRequest | null = null;
	private queue: ExportRequest[] = [];
	private timer: number | null = null;
	private initTimer: number | null = null;
	private currentDark: boolean | null = null;
	private destroyed = false;
	private iframeCreation: Promise<void> | null = null;
	private editorPolicy: EditorFramePolicy | null = null;

	constructor(private runtime: OfflineEditorRuntime) {}

	exportSvg(xml: string, dark: boolean): Promise<string> {
		if (this.destroyed) return Promise.reject(new Error('Preview exporter is unavailable.'));
		return new Promise((resolve, reject) => {
			const request: ExportRequest = {
				xml,
				dark,
				local: this.runtime.isUsingLocalEditor,
				deadlineTimer: null,
				resolve,
				reject,
			};
			request.deadlineTimer = this.win.setTimeout(
				() => this.timeoutRequest(request),
				REQUEST_DEADLINE_MS,
			);
			this.queue.push(request);
			this.process();
		});
	}

	private process(): void {
		if (this.destroyed || this.active || this.queue.length === 0) return;
		const next = this.queue[0];
		if (!next) return;
		if (!this.iframe || this.currentDark !== next.dark) {
			this.startIframe(next.dark);
			return;
		}
		if (!this.ready) return;

		this.active = this.queue.shift() ?? null;
		if (!this.active) return;
		this.post({
			action: 'export',
			format: 'svg',
			xml: this.active.xml,
			border: 8,
			embedImages: true,
			embedFonts: true,
			keepTheme: true,
			theme: this.active.dark ? 'dark' : 'light',
			currentPage: true,
			// SVG export does not use the PNG-only `transparent` flag. Passing
			// draw.io's NONE value prevents the adaptive page background from
			// being baked into the SVG, allowing the preview canvas to show through.
			background: 'none',
		});
		this.timer = this.win.setTimeout(
			() => this.failActive(new Error('Timed out generating the draw.io preview.')),
			EXPORT_TIMEOUT_MS,
		);
	}

	private startIframe(dark: boolean): void {
		if (this.iframeCreation) return;

		this.iframeCreation = this.createIframe(dark)
			.catch((error: unknown) =>
				this.failInitialization(error instanceof Error ? error : new Error(String(error))),
			)
			.finally(() => {
				this.iframeCreation = null;
			});
	}

	private async createIframe(dark: boolean): Promise<void> {
		this.teardownIframe();
		if (this.destroyed) return;
		this.currentDark = dark;
		this.ready = false;
		const params = new URLSearchParams({
			embed: '1',
			proto: 'json',
			configure: '1',
			libraries: '0',
			dark: dark ? '1' : '0',
			ui: 'min',
			spin: '0',
			...DRAWIO_RESTRICTED_URL_PARAMS,
		});
		const frameSource = await this.runtime.getEditorFrameSource(params);
		if (this.destroyed || this.currentDark !== dark) return;
		this.editorPolicy = createEditorFramePolicy(frameSource.url, frameSource.local);

		const doc = document;
		this.win = doc.defaultView ?? window;
		this.container = doc.body.createDiv({ cls: 'drawio-blocks-exporter' });
		this.iframe = this.container.createEl('iframe', {
			attr: {
				title: 'draw.io preview renderer',
				sandbox: 'allow-scripts allow-same-origin',
				referrerpolicy: 'no-referrer',
			},
		});
		this.iframe.addEventListener('error', () =>
			this.failInitialization(this.initializationError(frameSource.local)),
		);
		this.initTimer = this.win.setTimeout(
			() => this.failInitialization(this.initializationError(frameSource.local)),
			RENDERER_INIT_TIMEOUT_MS,
		);
		this.handler = (event) => {
			const message = this.parse(event.data);
			if (!message) return;
			const handshake = message.event === 'configure' || message.event === 'init';
			if (!this.editorPolicy?.accepts(event, this.iframe, handshake)) return;
			if (message.event === 'configure') {
				this.post({
					action: 'configure',
					config: {
						preserveViewState: true,
						suppressNewWindows: true,
					},
				});
			} else if (message.event === 'init') {
				// The documented embed flow guarantees init, but not a subsequent load event.
				// Load a minimal model, then mark the worker ready; postMessage ordering keeps
				// the queued export action behind the load action in the iframe.
				this.post({
					action: 'load',
					xml: EMPTY_DRAWIO_XML,
					noSaveBtn: 1,
					noExitBtn: 1,
					dark: this.currentDark ? 1 : 0,
				});
				if (this.initTimer !== null) this.win.clearTimeout(this.initTimer);
				this.initTimer = null;
				this.ready = true;
				this.win.setTimeout(() => this.process(), 0);
			} else if (message.event === 'export') {
				if (message.error) this.failActive(new Error(message.error));
				else if (typeof message.data === 'string') this.finishActive(message.data);
				else this.failActive(new Error('diagrams.net returned an empty SVG preview.'));
			} else if (message.error && !this.ready) {
				this.failInitialization(new Error(message.error));
			}
		};
		this.win.addEventListener('message', this.handler);
		if (frameSource.srcdoc !== undefined) this.iframe.srcdoc = frameSource.srcdoc;
		else this.iframe.src = frameSource.url;
	}

	private initializationError(local: boolean): Error {
		return new Error(
			local
				? 'The local draw.io preview renderer did not start. Re-download it in plugin settings or switch to online mode.'
				: 'Could not connect to diagrams.net. Check your network connection or enable the local editor.',
		);
	}

	private parse(data: unknown): DrawioMessage | null {
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

	private clearRequestDeadline(request: ExportRequest): void {
		if (request.deadlineTimer !== null) this.win.clearTimeout(request.deadlineTimer);
		request.deadlineTimer = null;
	}

	private timeoutRequest(request: ExportRequest): void {
		if (this.destroyed) return;
		this.clearRequestDeadline(request);
		const error = new Error(
			request.local
				? 'Timed out rendering with the local draw.io editor. Re-download it or switch to online mode.'
				: 'Could not connect to diagrams.net. Check your network connection or enable the local editor.',
		);

		if (this.active === request) {
			this.active = null;
			this.teardownIframe();
			this.currentDark = null;
			request.reject(error);
			this.process();
			return;
		}

		const index = this.queue.indexOf(request);
		if (index < 0) return;
		this.queue.splice(index, 1);
		if (index === 0) {
			this.teardownIframe();
			this.currentDark = null;
		}
		request.reject(error);
		this.process();
	}

	private finishActive(data: string): void {
		if (this.timer !== null) this.win.clearTimeout(this.timer);
		this.timer = null;
		const active = this.active;
		this.active = null;
		if (active) this.clearRequestDeadline(active);
		active?.resolve(data);
		this.process();
	}

	private failActive(error: Error): void {
		if (this.timer !== null) this.win.clearTimeout(this.timer);
		this.timer = null;

		const active = this.active;
		this.active = null;
		if (active) this.clearRequestDeadline(active);
		active?.reject(error);

		// A timed-out export can still reply later. Recreate the worker before
		// processing the next request so a stale response cannot resolve it.
		this.teardownIframe();
		this.currentDark = null;
		this.process();
	}

	private failInitialization(error: Error): void {
		if (this.destroyed) return;
		const active = this.active;
		this.active = null;
		if (active) this.clearRequestDeadline(active);
		active?.reject(error);
		const pending = this.queue.splice(0);
		this.teardownIframe();
		this.currentDark = null;
		for (const request of pending) {
			this.clearRequestDeadline(request);
			request.reject(error);
		}
	}

	private teardownIframe(): void {
		if (this.initTimer !== null) this.win.clearTimeout(this.initTimer);
		if (this.timer !== null) this.win.clearTimeout(this.timer);
		this.initTimer = null;
		this.timer = null;
		if (this.handler) this.win.removeEventListener('message', this.handler);
		this.handler = null;
		this.iframe?.remove();
		this.container?.remove();
		this.iframe = null;
		this.container = null;
		this.ready = false;
		this.editorPolicy = null;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.teardownIframe();
		if (this.active) this.clearRequestDeadline(this.active);
		this.active?.reject(new Error('Preview exporter stopped.'));
		this.active = null;
		for (const request of this.queue.splice(0)) {
			this.clearRequestDeadline(request);
			request.reject(new Error('Preview exporter stopped.'));
		}
	}
}
