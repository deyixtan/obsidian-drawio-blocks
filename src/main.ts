import {
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	MarkdownView,
	Notice,
	Plugin,
} from 'obsidian';
import { DEFAULT_EDITOR_SETTINGS_VERSION, EMPTY_DRAWIO_XML } from './constants';
import { DrawioModal } from './editor/DrawioModal';
import { PreviewService } from './preview/PreviewService';
import { CodeBlockSource } from './source/CodeBlockSource';
import type { DrawioSource } from './source/DrawioSource';
import { formatDrawioXml } from './utils/xml';
import { mountPreview, type PreviewHandle } from './view/renderPreview';

interface DrawioBlocksPluginData {
	editorSettingsVersion?: string;
}

export default class DrawioBlocksPlugin extends Plugin {
	readonly previewService = new PreviewService();

	private readonly previewHandles = new Set<PreviewHandle>();
	private editorSettingsVersion = DEFAULT_EDITOR_SETTINGS_VERSION;

	async onload(): Promise<void> {
		const data: unknown = await this.loadData();
		if (
			this.isPluginData(data) &&
			typeof data.editorSettingsVersion === 'string' &&
			data.editorSettingsVersion.length > 0
		) {
			this.editorSettingsVersion = data.editorSettingsVersion;
		}

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
				await this.saveData({
					editorSettingsVersion: this.editorSettingsVersion,
				} satisfies DrawioBlocksPluginData);
				new Notice(
					'draw.io editor settings will reset the next time the editor is opened.',
				);
			},
		});

		this.registerEvent(this.app.workspace.on('css-change', () => this.refreshAllPreviews()));
	}

	onunload(): void {
		this.previewService.destroy();
		for (const handle of this.previewHandles) {
			handle.destroy();
		}
		this.previewHandles.clear();
	}

	openEditor(source: DrawioSource, onSaved?: (xml: string) => void): void {
		new DrawioModal(
			this.app,
			source,
			this.isDark(),
			this.editorSettingsVersion,
			onSaved,
		).open();
	}

	isDark(): boolean {
		return (
			document.body.classList.contains('theme-dark') ||
			document.documentElement.classList.contains('theme-dark') ||
			window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
		);
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

	private refreshAllPreviews(): void {
		for (const handle of this.previewHandles) {
			handle.refresh();
		}
	}
}
