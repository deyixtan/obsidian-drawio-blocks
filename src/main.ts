import {
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	MarkdownView,
	Notice,
	normalizePath,
	Plugin,
} from 'obsidian';
import {
	DEFAULT_EDITOR_SETTINGS_VERSION,
	DEFAULT_PREVIEW_BORDER_COLOR,
	EMPTY_DRAWIO_XML,
} from './constants';
import {
	DRAWIO_EDITOR_VIEW_TYPE,
	DrawioEditorView,
	type DrawioEditorEnvironment,
	type DrawioEditorSession,
} from './editor/DrawioEditorView';
import { DrawioModal } from './editor/DrawioModal';
import {
	compareDrawioVersions,
	OfflineEditorRuntime,
	type LocalEditorInstallPhase,
} from './editor/offline/OfflineEditorRuntime';
import { PreviewService } from './preview/PreviewService';
import { DrawioBlocksSettingTab } from './settings/DrawioBlocksSettingTab';
import { CodeBlockSource } from './source/CodeBlockSource';
import type { DrawioSource } from './source/DrawioSource';
import { formatDrawioXml } from './utils/xml';
import { mountPreview, type PreviewHandle } from './view/renderPreview';

interface DrawioBlocksPluginData {
	editorSettingsVersion?: string;
	compressXml?: boolean;
	previewBorderColor?: string;
	showPreviewGrid?: boolean;
	useLocalEditor?: boolean;
}

export default class DrawioBlocksPlugin extends Plugin {
	previewService!: PreviewService;

	compressXml = false;
	previewBorderColor = DEFAULT_PREVIEW_BORDER_COLOR;
	showPreviewGrid = false;
	localEditorDownloaded = false;
	localEditorInstalled = false;
	localEditorInstalledVersion: string | null = null;
	localEditorInstallPhase: LocalEditorInstallPhase | null = null;
	localEditorEnabling = false;
	localEditorRemoving = false;
	useLocalEditor = false;

	private editorSessionCounter = 0;
	private readonly editorSessions = new Map<string, DrawioEditorSession>();
	private readonly previewHandles = new Set<PreviewHandle>();
	private localEditorDownloadOperation: Promise<void> | null = null;
	private editorRuntime!: OfflineEditorRuntime;
	private editorSettingsVersion = DEFAULT_EDITOR_SETTINGS_VERSION;
	private settingsTab: DrawioBlocksSettingTab | null = null;
	private unloading = false;

	async onload(): Promise<void> {
		const pluginDirectory =
			this.manifest.dir ??
			normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
		this.editorRuntime = new OfflineEditorRuntime(this.app, pluginDirectory);

		const data: unknown = await this.loadData();

		if (this.isPluginData(data)) {
			if (
				typeof data.editorSettingsVersion === 'string' &&
				data.editorSettingsVersion.length > 0
			) {
				this.editorSettingsVersion = data.editorSettingsVersion;
			}

			this.compressXml = data.compressXml === true;
			if (
				typeof data.previewBorderColor === 'string' &&
				/^#[\da-f]{6}$/i.test(data.previewBorderColor)
			) {
				this.previewBorderColor = data.previewBorderColor;
			}
			this.showPreviewGrid = data.showPreviewGrid === true;
			this.useLocalEditor = data.useLocalEditor === true;
		}

		await this.refreshLocalEditorState();

		if (this.useLocalEditor && !this.localEditorDownloaded) {
			this.useLocalEditor = false;
			await this.savePluginData();
			new Notice('draw.io Blocks: Local editor files were not found; using online mode.');
		}

		this.editorRuntime.setUseLocalEditor(this.useLocalEditor);
		this.previewService = new PreviewService(this.editorRuntime);

		this.registerView(DRAWIO_EDITOR_VIEW_TYPE, (leaf) => new DrawioEditorView(leaf, this));
		this.settingsTab = new DrawioBlocksSettingTab(this);
		this.addSettingTab(this.settingsTab);

		this.registerMarkdownCodeBlockProcessor('drawio', (source, element, context) => {
			this.renderCodeBlock(source, element, context);
		});

		this.addCommand({
			id: 'insert-drawio-code-block',
			name: 'Insert inline draw.io diagram',
			callback: () => this.insertDrawioCodeBlock(),
		});

		this.addCommand({
			id: 'refresh-drawio-previews',
			name: 'Refresh draw.io previews',
			callback: () => this.refreshAllPreviews(),
		});

		this.addCommand({
			id: 'reset-drawio-editor-settings',
			name: 'Reset draw.io editor settings',
			callback: async () => {
				this.editorSettingsVersion = Date.now().toString();
				await this.savePluginData();

				new Notice(
					'draw.io editor settings will reset the next time the editor is opened.',
				);
			},
		});

		this.registerEvent(this.app.workspace.on('css-change', () => this.refreshAllPreviews()));
	}

	onunload(): void {
		this.unloading = true;
		this.previewService.destroy();
		this.editorRuntime.destroy();
		for (const handle of this.previewHandles) {
			handle.destroy();
		}
		this.previewHandles.clear();
		this.editorSessions.clear();
		this.settingsTab = null;
	}

	openEditor(source: DrawioSource, onSaved?: (xml: string) => void): void {
		new DrawioModal(
			this.app,
			source,
			this.isDark(),
			this.editorRuntime,
			this.editorSettingsVersion,
			this.compressXml,
			onSaved,
		).open();
	}

	async openEditorInTab(source: DrawioSource, onSaved?: (xml: string) => void): Promise<void> {
		const sessionId = `${Date.now()}-${++this.editorSessionCounter}`;
		const leaf = this.app.workspace.getLeaf('tab');
		this.editorSessions.set(sessionId, { source, onSaved });

		try {
			await leaf.setViewState({
				type: DRAWIO_EDITOR_VIEW_TYPE,
				active: true,
				state: { sessionId },
			});
			await this.app.workspace.revealLeaf(leaf);
		} catch (error) {
			this.editorSessions.delete(sessionId);
			leaf.detach();
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`draw.io Blocks: Could not open editor tab: ${message}`, 8000);
		}
	}

	resolveEditorSession(sessionId: string): DrawioEditorSession | null {
		return this.editorSessions.get(sessionId) ?? null;
	}

	releaseEditorSession(sessionId: string): void {
		this.editorSessions.delete(sessionId);
	}

	getEditorEnvironment(): DrawioEditorEnvironment {
		return {
			compressXml: this.compressXml,
			dark: this.isDark(),
			runtime: this.editorRuntime,
			settingsVersion: this.editorSettingsVersion,
		};
	}

	isDark(): boolean {
		if (
			document.body.classList.contains('theme-dark') ||
			document.documentElement.classList.contains('theme-dark')
		) {
			return true;
		}

		if (
			document.body.classList.contains('theme-light') ||
			document.documentElement.classList.contains('theme-light')
		) {
			return false;
		}

		return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
	}

	private insertDrawioCodeBlock(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('Open a Markdown note before inserting a draw.io diagram.');
			return;
		}

		const body = formatDrawioXml(EMPTY_DRAWIO_XML);
		view.editor.replaceSelection(`\n\`\`\`drawio\n${body}\n\`\`\`\n`);
	}

	private renderCodeBlock(
		sourceXml: string,
		element: HTMLElement,
		context: MarkdownPostProcessorContext,
	): void {
		const source = new CodeBlockSource(this.app, context, element, sourceXml);
		const handle = mountPreview(this, element, source, () =>
			Promise.resolve(source.snapshot()),
		);
		this.previewHandles.add(handle);

		const lifecycle = new MarkdownRenderChild(element);
		lifecycle.register(() => {
			if (this.previewHandles.delete(handle)) {
				handle.destroy();
			}
		});
		context.addChild(lifecycle);
	}

	private isPluginData(value: unknown): value is DrawioBlocksPluginData {
		return value !== null && typeof value === 'object';
	}

	async savePluginData(): Promise<void> {
		await this.saveData({
			editorSettingsVersion: this.editorSettingsVersion,
			compressXml: this.compressXml,
			previewBorderColor: this.previewBorderColor,
			showPreviewGrid: this.showPreviewGrid,
			useLocalEditor: this.useLocalEditor,
		} satisfies DrawioBlocksPluginData);
	}

	get localEditorVersion(): string {
		return this.editorRuntime.localEditorVersion;
	}

	get localEditorUpdateAvailable(): boolean {
		if (
			!this.localEditorDownloaded ||
			this.localEditorInstalled ||
			!this.localEditorInstalledVersion
		) {
			return false;
		}

		return (
			this.localEditorInstalledVersion === this.localEditorVersion ||
			compareDrawioVersions(this.localEditorVersion, this.localEditorInstalledVersion) > 0
		);
	}

	downloadLocalEditor(): Promise<void> {
		if (!this.localEditorDownloadOperation) {
			const operation = this.runLocalEditorDownload();
			this.localEditorDownloadOperation = operation;
			void operation.then(
				() => {
					if (this.localEditorDownloadOperation === operation) {
						this.localEditorDownloadOperation = null;
					}
				},
				() => {
					if (this.localEditorDownloadOperation === operation) {
						this.localEditorDownloadOperation = null;
					}
				},
			);
		}

		return this.localEditorDownloadOperation;
	}

	async removeLocalEditor(): Promise<void> {
		if (this.localEditorDownloadOperation) {
			throw new Error('Wait for the local editor installation to finish before removing it.');
		}

		this.localEditorRemoving = true;
		this.refreshSettings();

		try {
			if (this.useLocalEditor) await this.setUseLocalEditor(false);
			await this.editorRuntime.removeLocalEditor();
			this.localEditorDownloaded = false;
			this.localEditorInstalled = false;
			this.localEditorInstalledVersion = null;
		} finally {
			this.localEditorRemoving = false;
			this.refreshSettings();
		}
	}

	async setUseLocalEditor(value: boolean): Promise<void> {
		if (value && !(await this.editorRuntime.hasLocalEditorInstallation())) {
			this.localEditorDownloaded = false;
			this.localEditorInstalled = false;
			throw new Error('Download the local editor before enabling local mode.');
		}
		if (value) {
			this.localEditorDownloaded = true;
			this.localEditorInstalledVersion =
				await this.editorRuntime.getInstalledLocalEditorVersion();
		}
		if (value === this.useLocalEditor) return;

		const previous = this.useLocalEditor;
		this.useLocalEditor = value;
		this.editorRuntime.setUseLocalEditor(value);

		try {
			await this.savePluginData();
		} catch (error) {
			this.useLocalEditor = previous;
			this.editorRuntime.setUseLocalEditor(previous);
			throw error;
		}

		this.restartPreviewService();
		this.refreshSettings();
	}

	async setOfflineModeEnabled(value: boolean): Promise<void> {
		if (value) {
			this.localEditorEnabling = true;
			this.refreshSettings();

			try {
				await this.downloadLocalEditor();
				await this.setUseLocalEditor(true);
			} finally {
				this.localEditorEnabling = false;
				this.refreshSettings();
			}
			return;
		}

		await this.removeLocalEditor();
	}

	refreshPreviewAppearance(): void {
		for (const handle of this.previewHandles) {
			handle.updateAppearance();
		}
	}

	private refreshAllPreviews(): void {
		for (const handle of this.previewHandles) {
			handle.refresh();
		}
	}

	private async runLocalEditorDownload(): Promise<void> {
		this.localEditorInstallPhase = 'downloading';
		this.refreshSettings();

		try {
			await this.editorRuntime.downloadLocalEditor((phase) => {
				this.localEditorInstallPhase = phase;
				this.refreshSettings();
			});
			await this.refreshLocalEditorState();
			if (this.useLocalEditor) this.restartPreviewService();
		} finally {
			this.localEditorInstallPhase = null;
			this.refreshSettings();
		}
	}

	private async refreshLocalEditorState(): Promise<void> {
		const [installed, installedVersion] = await Promise.all([
			this.editorRuntime.isLocalEditorInstalled(),
			this.editorRuntime.getInstalledLocalEditorVersion(),
		]);
		this.localEditorInstalled = installed;
		this.localEditorInstalledVersion = installedVersion;
		this.localEditorDownloaded = installedVersion !== null;
	}

	private restartPreviewService(): void {
		this.previewService.destroy();
		this.previewService = new PreviewService(this.editorRuntime);
		this.refreshAllPreviews();
	}

	private refreshSettings(): void {
		if (!this.unloading) this.settingsTab?.update();
	}
}
