import {
	DRAWIO_EDITOR_URL,
	DRAWIO_ORIGIN,
	DRAWIO_RESTRICTED_URL_PARAMS,
	DRAWIO_ROUGH_URL_PARAMS,
	EMPTY_DRAWIO_XML,
} from '../constants';

interface ExportRequest {
	xml: string;
	dark: boolean;
	resolve: (value: string) => void;
	reject: (error: Error) => void;
}
interface DrawioMessage {
	event?: string;
	data?: string;
	error?: string;
}

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

	exportSvg(xml: string, dark: boolean): Promise<string> {
		if (this.destroyed) return Promise.reject(new Error('Preview exporter is unavailable.'));
		return new Promise((resolve, reject) => {
			this.queue.push({ xml, dark, resolve, reject });
			this.process();
		});
	}

	private process(): void {
		if (this.destroyed || this.active || this.queue.length === 0) return;
		const next = this.queue[0];
		if (!next) return;
		if (!this.iframe || this.currentDark !== next.dark) {
			this.createIframe(next.dark);
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
			30000,
		);
	}

	private createIframe(dark: boolean): void {
		this.teardownIframe();
		if (this.destroyed) return;
		this.currentDark = dark;
		this.ready = false;
		const doc = document;
		this.win = doc.defaultView ?? window;
		this.container = doc.body.createDiv({ cls: 'drawio-blocks-exporter' });
		const params = new URLSearchParams({
			embed: '1',
			proto: 'json',
			configure: '1',
			libraries: '0',
			dark: dark ? '1' : '0',
			ui: 'min',
			spin: '0',
			...DRAWIO_ROUGH_URL_PARAMS,
			...DRAWIO_RESTRICTED_URL_PARAMS,
		});
		this.iframe = this.container.createEl('iframe', {
			attr: {
				title: 'draw.io preview renderer',
				sandbox: 'allow-scripts allow-same-origin',
				referrerpolicy: 'no-referrer',
			},
		});
		this.iframe.addEventListener('error', () => {
			this.failInitialization(new Error('Could not load the diagrams.net preview renderer.'));
		});
		this.initTimer = this.win.setTimeout(
			() =>
				this.failInitialization(
					new Error('Timed out loading the diagrams.net preview renderer.'),
				),
			30000,
		);
		this.handler = (event) => {
			if (event.source !== this.iframe?.contentWindow || event.origin !== DRAWIO_ORIGIN)
				return;
			const message = this.parse(event.data);
			if (!message) return;
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
		this.iframe.src = `${DRAWIO_EDITOR_URL}?${params.toString()}`;
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
		this.iframe?.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_ORIGIN);
	}

	private finishActive(data: string): void {
		if (this.timer !== null) this.win.clearTimeout(this.timer);
		this.timer = null;
		const active = this.active;
		this.active = null;
		active?.resolve(data);
		this.process();
	}

	private failActive(error: Error): void {
		if (this.timer !== null) this.win.clearTimeout(this.timer);
		this.timer = null;

		const active = this.active;
		this.active = null;
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
		active?.reject(error);
		const pending = this.queue.splice(0);
		this.teardownIframe();
		this.currentDark = null;
		for (const request of pending) request.reject(error);
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
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.teardownIframe();
		this.active?.reject(new Error('Preview exporter stopped.'));
		this.active = null;
		for (const request of this.queue.splice(0))
			request.reject(new Error('Preview exporter stopped.'));
	}
}
