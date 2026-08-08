import { Notice, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { DEFAULT_PREVIEW_BORDER_COLOR } from '../constants';
import type DrawioBlocksPlugin from '../main';

type DrawioSettingKey = 'compressXml' | 'previewBorderColor' | 'showPreviewGrid';

export class DrawioBlocksSettingTab extends PluginSettingTab {
	constructor(private plugin: DrawioBlocksPlugin) {
		super(plugin.app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<DrawioSettingKey>[] {
		const busy =
			this.plugin.localEditorInstallPhase !== null ||
			this.plugin.localEditorEnabling ||
			this.plugin.localEditorRemoving;
		const displayedVersion =
			this.plugin.localEditorInstalledVersion ?? this.plugin.localEditorVersion;

		return [
			{
				type: 'group',
				heading: 'Offline mode',
				items: [
					{
						name: 'Local editor',
						desc: `Version: ${displayedVersion}`,
						aliases: [
							'download offline editor',
							'remove draw.io',
							'local editor version',
							'offline mode',
						],
						render: (setting) => {
							if (busy) {
								this.renderLocalEditorProgress(setting.controlEl);
								return;
							}

							if (
								this.plugin.localEditorDownloaded &&
								this.plugin.localEditorUpdateAvailable
							) {
								setting.addButton((button) =>
									button
										.setButtonText('Update')
										.setTooltip(
											`Update to draw.io ${this.plugin.localEditorVersion}`,
										)
										.onClick(() => this.updateLocalEditor()),
								);
							}

							setting.addToggle((toggle) =>
								toggle
									.setValue(this.plugin.useLocalEditor)
									.setTooltip(
										this.plugin.useLocalEditor
											? 'Disable offline mode and remove the local editor'
											: 'Download and enable the local editor',
									)
									.onChange((value) => this.setOfflineMode(value)),
							);
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Diagram appearance and storage',
				items: [
					{
						name: 'Preview border color',
						desc: 'Choose the border color around SVG previews.',
						aliases: ['SVG border', 'diagram outline'],
						control: {
							type: 'color',
							key: 'previewBorderColor',
							defaultValue: DEFAULT_PREVIEW_BORDER_COLOR,
						},
					},
					{
						name: 'Show preview grid',
						desc: 'Show a square grid behind SVG previews.',
						aliases: ['SVG grid', 'diagram grid'],
						control: {
							type: 'toggle',
							key: 'showPreviewGrid',
							defaultValue: false,
						},
					},
					{
						name: 'Compress XML',
						desc: 'Reduce Markdown size with draw.io compression. Existing diagrams convert the next time they are saved.',
						aliases: ['compressed XML', 'diagram format'],
						control: {
							type: 'toggle',
							key: 'compressXml',
							defaultValue: false,
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === 'previewBorderColor') return this.plugin.previewBorderColor;
		if (key === 'showPreviewGrid') return this.plugin.showPreviewGrid;
		if (key === 'compressXml') return this.plugin.compressXml;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'previewBorderColor') {
			if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) {
				throw new Error('Preview border color must be a six-digit hex color.');
			}
			this.plugin.previewBorderColor = value;
			await this.plugin.savePluginData();
			this.plugin.refreshPreviewAppearance();
			return;
		}

		if (typeof value !== 'boolean') throw new Error(`Invalid value for ${key}.`);

		if (key === 'showPreviewGrid') {
			this.plugin.showPreviewGrid = value;
			await this.plugin.savePluginData();
			this.plugin.refreshPreviewAppearance();
			return;
		}

		if (key === 'compressXml') {
			this.plugin.compressXml = value;
			await this.plugin.savePluginData();
		}
	}

	private renderLocalEditorProgress(container: HTMLElement): void {
		const label = this.plugin.localEditorRemoving
			? 'Removing…'
			: this.plugin.localEditorInstallPhase === null
				? 'Enabling…'
				: {
						downloading: 'Downloading…',
						verifying: 'Verifying…',
						installing: 'Installing…',
					}[this.plugin.localEditorInstallPhase ?? 'downloading'];
		const status = container.createDiv({
			cls: 'drawio-blocks-offline-progress',
			attr: { role: 'status', 'aria-live': 'polite', 'aria-label': label },
		});
		status.createSpan({ cls: 'drawio-blocks-offline-spinner' });
		status.createSpan({ text: label });
	}

	private setOfflineMode(value: boolean): void {
		void this.plugin.setOfflineModeEnabled(value).then(
			() => {
				new Notice(
					value
						? `draw.io Blocks: Offline mode enabled with draw.io ${this.plugin.localEditorInstalledVersion ?? this.plugin.localEditorVersion}.`
						: 'draw.io Blocks: Offline mode disabled and the local editor was removed.',
				);
			},
			(error: unknown) => {
				this.update();
				this.showError(error);
			},
		);
	}

	private updateLocalEditor(): void {
		void this.plugin.downloadLocalEditor().then(
			() => {
				new Notice(
					`draw.io Blocks: Local editor updated to ${this.plugin.localEditorVersion}.`,
				);
			},
			(error: unknown) => {
				this.update();
				this.showError(error);
			},
		);
	}

	private showError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`draw.io Blocks: ${message}`, 10000);
	}
}
