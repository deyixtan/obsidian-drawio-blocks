import { ItemView, Notice, type App, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { DrawioSource } from '../source/DrawioSource';
import { createDiagramMenu } from './diagramMenu';
import { DRAWIO_VIEWER_TITLE, DrawioViewer } from './DrawioViewer';

export const DRAWIO_VIEWER_VIEW_TYPE = 'drawio-blocks-viewer';

export interface DrawioViewerSession {
	imageUri: string;
	onSaved?: (xml: string) => void;
	source: DrawioSource;
	title: string;
}

export interface DrawioViewerViewHost {
	app: App;
	openEditor(source: DrawioSource, onSaved?: (xml: string) => void): void;
	openEditorInLeaf(
		leaf: WorkspaceLeaf,
		source: DrawioSource,
		onSaved?: (xml: string) => void,
	): Promise<void>;
	openEditorInTab(source: DrawioSource, onSaved?: (xml: string) => void): Promise<void>;
	openViewer(source: DrawioSource, imageUri: string, onSaved?: (xml: string) => void): void;
	openViewerInTab(
		source: DrawioSource,
		imageUri: string,
		onSaved?: (xml: string) => void,
	): Promise<void>;
	releaseViewerSession(sessionId: string): void;
	resolveViewerSession(sessionId: string): DrawioViewerSession | null;
}

function getSessionId(state: unknown): string | null {
	if (state === null || typeof state !== 'object' || !('sessionId' in state)) return null;
	const value = (state as { sessionId?: unknown }).sessionId;
	return typeof value === 'string' && value.length > 0 ? value : null;
}

export class DrawioViewerView extends ItemView {
	private opened = false;
	private session: DrawioViewerSession | null = null;
	private sessionId: string | null = null;
	private viewer: DrawioViewer | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: DrawioViewerViewHost,
	) {
		super(leaf);
		this.icon = 'image';
		this.navigation = true;
	}

	getViewType(): string {
		return DRAWIO_VIEWER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return DRAWIO_VIEWER_TITLE;
	}

	getState(): Record<string, unknown> {
		return this.sessionId ? { sessionId: this.sessionId } : {};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const nextSessionId = getSessionId(state);

		if (this.sessionId && this.sessionId !== nextSessionId) {
			this.host.releaseViewerSession(this.sessionId);
		}

		this.sessionId = nextSessionId;
		this.session = nextSessionId ? this.host.resolveViewerSession(nextSessionId) : null;
		if (this.opened) this.startViewer();
	}

	protected async onOpen(): Promise<void> {
		this.opened = true;
		this.contentEl.addClass('drawio-blocks-viewer-tab');
		this.startViewer();
	}

	private startViewer(): void {
		this.viewer?.destroy();
		this.viewer = null;
		this.contentEl.empty();

		if (!this.session) {
			const panel = this.contentEl.createDiv({ cls: 'drawio-blocks-error' });
			panel.createEl('h3', { text: 'Could not open the diagram viewer' });
			panel.createEl('p', {
				text: 'This viewer tab is no longer linked to a diagram. Close it and reopen the diagram from its preview.',
			});
			return;
		}

		const session = this.session;
		this.viewer = new DrawioViewer(this.contentEl, session.title, session.imageUri, {
			onClose: () => this.leaf.detach(),
			onContextMenu: (event, image) => this.showContextMenu(event, image),
			onEdit: () => {
				void this.host
					.openEditorInLeaf(this.leaf, session.source, session.onSaved)
					.catch((error: unknown) => {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`draw.io Blocks: Could not open editor: ${message}`, 8000);
					});
			},
			xmlProvider: () => session.source.read(),
		});
		this.viewer.mount();
	}

	private showContextMenu(event: MouseEvent, image: HTMLImageElement): void {
		if (!this.session) return;
		const { imageUri, onSaved, source } = this.session;
		createDiagramMenu({
			app: this.host.app,
			imageProvider: () => Promise.resolve(image),
			onDeleted: () => this.leaf.detach(),
			openEditor: (inTab) => {
				if (inTab) void this.host.openEditorInTab(source, onSaved);
				else this.host.openEditor(source, onSaved);
			},
			openViewer: (inTab) => {
				if (inTab) void this.host.openViewerInTab(source, imageUri, onSaved);
				else this.host.openViewer(source, imageUri, onSaved);
			},
			source,
			xmlProvider: () => source.read(),
		}).showAtMouseEvent(event);
	}

	protected async onClose(): Promise<void> {
		this.opened = false;
		this.viewer?.destroy();
		this.viewer = null;
		this.contentEl.empty();

		if (this.sessionId) this.host.releaseViewerSession(this.sessionId);
		this.sessionId = null;
		this.session = null;
	}
}
