import { App, Modal } from 'obsidian';
import { DRAWIO_EDITOR_URL, DRAWIO_ORIGIN } from '../constants';
import type { DrawioSource } from '../source/DrawioSource';

export class DrawioModal extends Modal {
	private iframe: HTMLIFrameElement | null = null;
	private onMessage: ((event: MessageEvent) => void) | null = null;

	constructor(
		app: App,
		private source: DrawioSource,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('drawio-editor-modal');
		this.contentEl.empty();

		const params = new URLSearchParams({
			embed: '1',
			proto: 'json',
			spin: '1',
			saveAndExit: '1',
		});

		this.iframe = this.contentEl.createEl('iframe', {
			cls: 'drawio-editor-frame',
			attr: {
				src: `${DRAWIO_EDITOR_URL}?${params.toString()}`,
				title: this.source.title(),
				sandbox:
					'allow-scripts allow-same-origin allow-forms allow-modals',
				referrerpolicy: 'no-referrer',
			},
		});

		const iframe = this.iframe;

		this.onMessage = (event: MessageEvent) => {
			if (event.origin !== DRAWIO_ORIGIN) return;
			if (event.source !== iframe.contentWindow) return;

			let message: unknown;
			try {
				message =
					typeof event.data === 'string'
						? JSON.parse(event.data)
						: event.data;
			} catch {
				return;
			}

			if (!message || typeof message !== 'object') return;
			void this.handleMessage(message as Record<string, unknown>);
		};

		window.addEventListener('message', this.onMessage);
	}

	onClose(): void {
		if (this.onMessage) {
			window.removeEventListener('message', this.onMessage);
		}

		this.onMessage = null;
		this.iframe = null;
		this.contentEl.empty();
	}

	private async handleMessage(
		message: Record<string, unknown>,
	): Promise<void> {
		if (message.event === 'init') {
			const xml = await this.source.read();

			this.post({
				action: 'load',
				xml,
				autosave: 0,
			});
		}

		if (message.event === 'save' && typeof message.xml === 'string') {
			await this.source.write(message.xml);

			if (message.exit === true) {
				this.close();
			}
		}

		if (message.event === 'exit') {
			this.close();
		}
	}

	private post(message: object): void {
		this.iframe?.contentWindow?.postMessage(
			JSON.stringify(message),
			DRAWIO_ORIGIN,
		);
	}
}
