import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { DrawioSource } from '../source/DrawioSource';
import { DrawioBridge } from './DrawioBridge';
import { formatDrawioEditorTitle } from './editorTitle';
import type { OfflineEditorRuntime } from './offline/OfflineEditorRuntime';

export const DRAWIO_EDITOR_VIEW_TYPE = 'drawio-blocks-editor';

export interface DrawioEditorSession {
	onSaved?: (xml: string) => void;
	source: DrawioSource;
}

export interface DrawioEditorEnvironment {
	compressXml: boolean;
	dark: boolean;
	runtime: OfflineEditorRuntime;
	settingsVersion: string;
}

export interface DrawioEditorViewHost {
	getEditorEnvironment(): DrawioEditorEnvironment;
	releaseEditorSession(sessionId: string): void;
	resolveEditorSession(sessionId: string): DrawioEditorSession | null;
}

function getSessionId(state: unknown): string | null {
	if (state === null || typeof state !== 'object' || !('sessionId' in state)) return null;
	const value = (state as { sessionId?: unknown }).sessionId;
	return typeof value === 'string' && value.length > 0 ? value : null;
}

export class DrawioEditorView extends ItemView {
	private bridge: DrawioBridge | null = null;
	private opened = false;
	private session: DrawioEditorSession | null = null;
	private sessionId: string | null = null;
	private shell: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private host: DrawioEditorViewHost,
	) {
		super(leaf);
		this.icon = 'workflow';
		this.navigation = true;
	}

	getViewType(): string {
		return DRAWIO_EDITOR_VIEW_TYPE;
	}

	getDisplayText(): string {
		const environment = this.host.getEditorEnvironment();
		return formatDrawioEditorTitle(environment.runtime.isUsingLocalEditor);
	}

	getState(): Record<string, unknown> {
		return this.sessionId ? { sessionId: this.sessionId } : {};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const nextSessionId = getSessionId(state);

		if (this.sessionId && this.sessionId !== nextSessionId) {
			this.host.releaseEditorSession(this.sessionId);
		}

		this.sessionId = nextSessionId;
		this.session = nextSessionId ? this.host.resolveEditorSession(nextSessionId) : null;
		if (this.opened) this.startEditor();
	}

	protected async onOpen(): Promise<void> {
		this.opened = true;
		this.contentEl.empty();
		this.contentEl.addClass('drawio-blocks-editor-tab');
		this.shell = this.contentEl.createDiv({ cls: 'drawio-blocks-editor-shell' });
		this.startEditor();
	}

	private startEditor(): void {
		if (!this.shell) return;

		this.bridge?.destroy();
		this.bridge = null;
		this.shell.empty();

		if (!this.session) {
			this.showError(
				new Error(
					'This editor tab is no longer linked to a diagram. Close it and reopen the diagram from its preview.',
				),
				false,
			);
			return;
		}

		const loading = this.shell.createDiv({
			cls: 'drawio-blocks-editor-loading',
			text: 'Loading diagrams.net…',
		});
		const environment = this.host.getEditorEnvironment();
		this.bridge = new DrawioBridge(
			this.shell,
			this.session.source,
			environment.dark,
			environment.runtime,
			{
				settingsVersion: environment.settingsVersion,
				compressXml: environment.compressXml,
				onExit: () => this.leaf.detach(),
				onSaved: this.session.onSaved,
				onReady: () => loading.remove(),
				onError: (error) => this.showError(error),
			},
		);

		void this.bridge
			.mount()
			.catch((error: unknown) =>
				this.showError(error instanceof Error ? error : new Error(String(error))),
			);
	}

	private showError(error: Error, retry = true): void {
		if (!this.shell) return;

		this.bridge?.destroy();
		this.bridge = null;
		this.shell.empty();

		const panel = this.shell.createDiv({ cls: 'drawio-blocks-error' });
		panel.createEl('h3', { text: 'Could not open the draw.io editor' });
		panel.createEl('p', { text: error.message });

		const actions = panel.createDiv({ cls: 'drawio-blocks-error-actions' });
		if (retry) {
			actions
				.createEl('button', { text: 'Retry', cls: 'mod-cta' })
				.addEventListener('click', () => this.startEditor());
		}
		actions
			.createEl('button', { text: 'Close' })
			.addEventListener('click', () => this.leaf.detach());
	}

	protected async onClose(): Promise<void> {
		this.opened = false;
		this.bridge?.destroy();
		this.bridge = null;
		this.shell = null;
		this.contentEl.empty();

		if (this.sessionId) this.host.releaseEditorSession(this.sessionId);
		this.sessionId = null;
		this.session = null;
	}
}
