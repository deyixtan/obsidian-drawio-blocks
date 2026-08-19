import { App, Modal } from 'obsidian';
import { DrawioViewer } from './DrawioViewer';

export class DrawioViewerModal extends Modal {
	private viewer: DrawioViewer | null = null;

	constructor(
		app: App,
		private readonly title: string,
		private readonly imageUri: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.ownerDocument.body.addClass('drawio-blocks-viewer-modal-open');
		this.modalEl.addClass('drawio-blocks-viewer-modal');
		this.modalEl.setAttribute('aria-label', `View ${this.title}`);
		this.contentEl.addClass('drawio-blocks-viewer-content');
		this.viewer = new DrawioViewer(this.contentEl, this.title, this.imageUri, () =>
			this.close(),
		);
		this.viewer.mount();
	}

	onClose(): void {
		this.modalEl.ownerDocument.body.removeClass('drawio-blocks-viewer-modal-open');
		this.viewer?.destroy();
		this.viewer = null;
		this.contentEl.empty();
	}
}
