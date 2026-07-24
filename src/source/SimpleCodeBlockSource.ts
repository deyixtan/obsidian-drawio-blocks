import { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import type { DrawioSource } from './DrawioSource';

export class SimpleCodeBlockSource implements DrawioSource {
	private currentXml: string;

	constructor(
		private app: App,
		private context: MarkdownPostProcessorContext,
		private element: HTMLElement,
		initialXml: string,
	) {
		this.currentXml = initialXml.trim();
	}

	title(): string {
		return 'Inline draw.io diagram';
	}

	async read(): Promise<string> {
		return this.currentXml;
	}

	async write(xml: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(
			this.context.sourcePath,
		);

		if (!(file instanceof TFile)) {
			throw new Error('Could not locate the source note.');
		}

		const section = this.context.getSectionInfo(this.element);
		if (!section) {
			throw new Error('Could not locate the drawio code block.');
		}

		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const body = xml.trim().split('\n');
			const bodyLength = section.lineEnd - section.lineStart - 1;

			lines.splice(section.lineStart + 1, bodyLength, ...body);
			return lines.join('\n');
		});

		this.currentXml = xml.trim();
	}
}
