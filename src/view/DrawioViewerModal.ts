import { App, Modal } from 'obsidian';
import { DrawioBridge } from '../editor/DrawioBridge';
import type { DrawioEditorEnvironment } from '../editor/DrawioEditorView';
import type { DrawioSource } from '../source/DrawioSource';
import { createDiagramMenu } from './diagramMenu';
import { DrawioViewer } from './DrawioViewer';

export interface DrawioViewerModalHost {
	getEditorEnvironment(): DrawioEditorEnvironment;
	openEditor(source: DrawioSource, onSaved?: (xml: string) => void): void;
	openEditorInTab(source: DrawioSource, onSaved?: (xml: string) => void): Promise<void>;
	openViewer(source: DrawioSource, imageUri: string, onSaved?: (xml: string) => void): void;
	openViewerInTab(
		source: DrawioSource,
		imageUri: string,
		onSaved?: (xml: string) => void,
	): Promise<void>;
}

export class DrawioViewerModal extends Modal {
	private bridge: DrawioBridge | null = null;
	private editorShell: HTMLElement | null = null;
	private viewer: DrawioViewer | null = null;

	constructor(
		app: App,
		private readonly host: DrawioViewerModalHost,
		private readonly source: DrawioSource,
		private readonly imageUri: string,
		private readonly onSaved?: (xml: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.startViewer();
	}

	private startViewer(): void {
		this.bridge?.destroy();
		this.bridge = null;
		this.editorShell = null;
		this.contentEl.empty();
		this.modalEl.ownerDocument.body.removeClass('drawio-blocks-editor-modal-open');
		this.modalEl.ownerDocument.body.addClass('drawio-blocks-viewer-modal-open');
		this.modalEl.removeClass('drawio-blocks-modal');
		this.modalEl.addClass('drawio-blocks-viewer-modal');
		this.contentEl.removeClass('drawio-blocks-modal-content');
		this.contentEl.addClass('drawio-blocks-viewer-content');
		this.viewer = new DrawioViewer(this.contentEl, this.source.title(), this.imageUri, {
			onClose: () => this.close(),
			onContextMenu: (event, image) => this.showContextMenu(event, image),
			onEdit: () => this.startEditor(),
			xmlProvider: () => this.source.read(),
		});
		this.viewer.mount();
	}

	private startEditor(): void {
		this.viewer?.destroy();
		this.viewer = null;
		this.contentEl.empty();
		this.modalEl.ownerDocument.body.removeClass('drawio-blocks-viewer-modal-open');
		this.modalEl.ownerDocument.body.addClass('drawio-blocks-editor-modal-open');
		this.modalEl.removeClass('drawio-blocks-viewer-modal');
		this.modalEl.addClass('drawio-blocks-modal');
		this.contentEl.removeClass('drawio-blocks-viewer-content');
		this.contentEl.addClass('drawio-blocks-modal-content');
		this.editorShell = this.contentEl.createDiv({ cls: 'drawio-blocks-editor-shell' });
		this.mountEditor();
	}

	private mountEditor(): void {
		if (!this.editorShell) return;
		this.bridge?.destroy();
		this.bridge = null;
		this.editorShell.empty();

		const loading = this.editorShell.createDiv({
			cls: 'drawio-blocks-editor-loading',
			text: 'Loading diagrams.net…',
		});
		const environment = this.host.getEditorEnvironment();
		this.bridge = new DrawioBridge(
			this.editorShell,
			this.source,
			environment.dark,
			environment.runtime,
			{
				settingsVersion: environment.settingsVersion,
				compressXml: environment.compressXml,
				onExit: () => this.close(),
				onSaved: this.onSaved,
				onReady: () => loading.remove(),
				onError: (error) => this.showEditorError(error),
			},
		);
		void this.bridge
			.mount()
			.catch((error: unknown) =>
				this.showEditorError(error instanceof Error ? error : new Error(String(error))),
			);
	}

	private showEditorError(error: Error): void {
		if (!this.editorShell) return;
		this.bridge?.destroy();
		this.bridge = null;
		this.editorShell.empty();

		const panel = this.editorShell.createDiv({ cls: 'drawio-blocks-error' });
		panel.createEl('h3', { text: 'Could not open the draw.io editor' });
		panel.createEl('p', { text: error.message });
		const actions = panel.createDiv({ cls: 'drawio-blocks-error-actions' });
		actions
			.createEl('button', { text: 'Retry', cls: 'mod-cta' })
			.addEventListener('click', () => this.mountEditor());
		actions.createEl('button', { text: 'Close' }).addEventListener('click', () => this.close());
	}

	private showContextMenu(event: MouseEvent, image: HTMLImageElement): void {
		createDiagramMenu({
			app: this.app,
			imageProvider: () => Promise.resolve(image),
			onDeleted: () => this.close(),
			openEditor: (inTab) => {
				if (inTab) void this.host.openEditorInTab(this.source, this.onSaved);
				else this.host.openEditor(this.source, this.onSaved);
			},
			openViewer: (inTab) => {
				if (inTab) void this.host.openViewerInTab(this.source, this.imageUri, this.onSaved);
				else this.host.openViewer(this.source, this.imageUri, this.onSaved);
			},
			source: this.source,
			xmlProvider: () => this.source.read(),
		}).showAtMouseEvent(event);
	}

	onClose(): void {
		this.modalEl.ownerDocument.body.removeClass(
			'drawio-blocks-editor-modal-open',
			'drawio-blocks-viewer-modal-open',
		);
		this.viewer?.destroy();
		this.viewer = null;
		this.bridge?.destroy();
		this.bridge = null;
		this.editorShell = null;
		this.contentEl.empty();
	}
}
