import { FileView, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import { DrawioBridge } from '../editor/DrawioBridge';
import type { DrawioEditorEnvironment } from '../editor/DrawioEditorView';
import { DrawioFileSource } from '../source/DrawioFileSource';
import type { DrawioSource } from '../source/DrawioSource';
import { createDiagramMenu } from './diagramMenu';
import { DrawioViewer } from './DrawioViewer';

export const DRAWIO_FILE_VIEW_TYPE = 'drawio-blocks-file';

export interface DrawioFileViewHost {
	app: App;
	getEditorEnvironment(): DrawioEditorEnvironment;
	openEditor(source: DrawioSource, onSaved?: (xml: string) => void): void;
	openEditorInTab(source: DrawioSource, onSaved?: (xml: string) => void): Promise<void>;
	openViewer(source: DrawioSource, imageUri: string, onSaved?: (xml: string) => void): void;
	openViewerInTab(
		source: DrawioSource,
		imageUri: string,
		onSaved?: (xml: string) => void,
	): Promise<void>;
	renderDiagram(xml: string): Promise<string>;
}

export class DrawioFileView extends FileView {
	private bridge: DrawioBridge | null = null;
	private editorShell: HTMLElement | null = null;
	private imageUri = '';
	private mode: 'editor' | 'viewer' = 'viewer';
	private renderGeneration = 0;
	private source: DrawioFileSource | null = null;
	private viewer: DrawioViewer | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: DrawioFileViewHost,
	) {
		super(leaf);
		this.icon = 'image';
		this.navigation = true;
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file === this.file && this.mode === 'viewer') void this.startViewer();
			}),
		);
	}

	getViewType(): string {
		return DRAWIO_FILE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'draw.io Viewer';
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		this.source = new DrawioFileSource(this.app, file);
		this.mode = 'viewer';
		void this.startViewer();
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.destroyContent();
		this.source = null;
		await super.onUnloadFile(file);
	}

	private async startViewer(): Promise<void> {
		const source = this.source;
		if (!source) return;
		const generation = ++this.renderGeneration;
		this.mode = 'viewer';
		this.viewer?.destroy();
		this.viewer = null;
		this.bridge?.destroy();
		this.bridge = null;
		this.editorShell = null;
		this.contentEl.empty();
		this.contentEl.removeClass('drawio-blocks-editor-tab');
		this.contentEl.addClass('drawio-blocks-drawio-file');
		this.contentEl.createDiv({
			cls: 'drawio-blocks-viewer-status',
			text: 'Rendering diagram…',
		});

		try {
			const xml = await source.read();
			const imageUri = await this.host.renderDiagram(xml);
			if (generation !== this.renderGeneration || this.mode !== 'viewer') return;
			this.imageUri = imageUri;
			this.contentEl.empty();
			this.viewer = new DrawioViewer(this.contentEl, source.title(), imageUri, {
				onClose: () => this.leaf.detach(),
				onContextMenu: (event, image) => this.showContextMenu(event, image),
				onEdit: () => this.startEditor(),
				xmlProvider: () => source.read(),
			});
			this.viewer.mount();
		} catch (error) {
			if (generation !== this.renderGeneration || this.mode !== 'viewer') return;
			this.showViewerError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private showViewerError(error: Error): void {
		this.contentEl.empty();
		const panel = this.contentEl.createDiv({ cls: 'drawio-blocks-error' });
		panel.createEl('h3', { text: 'Could not render the draw.io file' });
		panel.createEl('p', { text: error.message });
		const actions = panel.createDiv({ cls: 'drawio-blocks-error-actions' });
		actions
			.createEl('button', { text: 'Retry', cls: 'mod-cta' })
			.addEventListener('click', () => void this.startViewer());
		actions
			.createEl('button', { text: 'Edit' })
			.addEventListener('click', () => this.startEditor());
	}

	private startEditor(): void {
		const source = this.source;
		if (!source) return;
		this.mode = 'editor';
		this.renderGeneration += 1;
		this.viewer?.destroy();
		this.viewer = null;
		this.contentEl.empty();
		this.contentEl.removeClass('drawio-blocks-drawio-file');
		this.contentEl.addClass('drawio-blocks-editor-tab');
		this.editorShell = this.contentEl.createDiv({ cls: 'drawio-blocks-editor-shell' });
		this.mountEditor();
	}

	private mountEditor(): void {
		if (!this.editorShell || !this.source) return;
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
				onExit: () => this.leaf.detach(),
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
		actions
			.createEl('button', { text: 'Close' })
			.addEventListener('click', () => this.leaf.detach());
	}

	private showContextMenu(event: MouseEvent, image: HTMLImageElement): void {
		const source = this.source;
		if (!source) return;
		createDiagramMenu({
			app: this.app,
			imageProvider: () => Promise.resolve(image),
			onDeleted: () => this.leaf.detach(),
			openEditor: (inTab) => {
				if (inTab) void this.host.openEditorInTab(source);
				else this.host.openEditor(source);
			},
			openViewer: (inTab) => {
				if (inTab) void this.host.openViewerInTab(source, this.imageUri);
				else this.host.openViewer(source, this.imageUri);
			},
			source,
			xmlProvider: () => source.read(),
		}).showAtMouseEvent(event);
	}

	private destroyContent(): void {
		this.renderGeneration += 1;
		this.viewer?.destroy();
		this.viewer = null;
		this.bridge?.destroy();
		this.bridge = null;
		this.editorShell = null;
		this.imageUri = '';
		this.contentEl.empty();
		this.contentEl.removeClass('drawio-blocks-drawio-file', 'drawio-blocks-editor-tab');
	}
}
