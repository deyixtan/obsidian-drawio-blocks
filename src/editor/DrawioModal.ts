import { App, Modal } from 'obsidian';
import type { DrawioSource } from '../source/DrawioSource';
import { DrawioBridge } from './DrawioBridge';

export class DrawioModal extends Modal {
	private bridge: DrawioBridge | null = null;
	private shell: HTMLElement | null = null;

	constructor(
		app: App,
		private source: DrawioSource,
		private dark: boolean,
		private editorSettingsVersion: string,
		private onSaved?: (xml: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('drawio-blocks-modal');
		this.contentEl.addClass('drawio-blocks-modal-content');
		this.contentEl.empty();
		this.shell = this.contentEl.createDiv({ cls: 'drawio-blocks-editor-shell' });
		this.startEditor();
	}

	private startEditor(): void {
		if (!this.shell) return;

		this.bridge?.destroy();
		this.bridge = null;
		this.shell.empty();

		const loading = this.shell.createDiv({
			cls: 'drawio-blocks-editor-loading',
			text: 'Loading diagrams.net…',
		});

		this.bridge = new DrawioBridge(this.shell, this.source, this.dark, {
			settingsVersion: this.editorSettingsVersion,
			onExit: () => this.close(),
			onSaved: this.onSaved,
			onReady: () => loading.remove(),
			onError: (error) => this.showError(error),
		});

		void this.bridge
			.mount()
			.catch((error: unknown) =>
				this.showError(error instanceof Error ? error : new Error(String(error))),
			);
	}

	private showError(error: Error): void {
		if (!this.shell) return;

		this.bridge?.destroy();
		this.bridge = null;
		this.shell.empty();

		const panel = this.shell.createDiv({ cls: 'drawio-blocks-error' });
		panel.createEl('h3', { text: 'Could not open the draw.io editor' });
		panel.createEl('p', { text: error.message });

		const actions = panel.createDiv({ cls: 'drawio-blocks-error-actions' });
		actions
			.createEl('button', { text: 'Retry', cls: 'mod-cta' })
			.addEventListener('click', () => this.startEditor());
		actions.createEl('button', { text: 'Close' }).addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.bridge?.destroy();
		this.bridge = null;
		this.shell = null;
		this.contentEl.empty();
	}
}
