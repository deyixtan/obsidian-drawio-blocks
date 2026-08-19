import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { DrawioViewer } from './DrawioViewer';

export const DRAWIO_VIEWER_VIEW_TYPE = 'drawio-blocks-viewer';

export interface DrawioViewerSession {
	imageUri: string;
	title: string;
}

export interface DrawioViewerViewHost {
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
		return this.session?.title ?? 'draw.io Viewer';
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

		this.viewer = new DrawioViewer(this.contentEl, this.session.title, this.session.imageUri);
		this.viewer.mount();
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
