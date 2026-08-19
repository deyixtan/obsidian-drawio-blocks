import { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import type { DrawioSource } from './DrawioSource';
import { formatDrawioXml, validateDrawioXml } from '../utils/xml';
import {
	findDrawioBlocks,
	getDrawioBlockBody,
	removeDrawioBlock,
	replaceDrawioBlockBody,
	type DrawioBlockRange,
} from '../utils/codeBlock';

export class CodeBlockSource implements DrawioSource {
	private lastBody: string;
	private writeChain: Promise<void> = Promise.resolve();

	constructor(
		private app: App,
		private context: MarkdownPostProcessorContext,
		private element: HTMLElement,
		initialBody: string,
	) {
		this.lastBody = initialBody.trim();
	}

	title(): string {
		return 'Inline draw.io diagram';
	}

	deleteDescription(): string {
		return 'This removes the entire draw.io code block from the note.';
	}

	snapshot(): string {
		return this.lastBody;
	}

	suggestedImagePath(extension: string): string {
		const sourcePath = this.context.sourcePath;
		const separator = sourcePath.lastIndexOf('/');
		const directory = separator >= 0 ? sourcePath.slice(0, separator + 1) : '';
		const filename = sourcePath.slice(separator + 1);
		const basename = filename.replace(/\.[^.]+$/, '') || 'drawio';
		return `${directory}${basename}-diagram.${extension}`;
	}

	async read(): Promise<string> {
		const file = this.getSourceFile();
		const current = await this.app.vault.read(file);
		const lines = current.split(/\r?\n/);
		const range = this.locateCurrentRange(lines);
		const body = getDrawioBlockBody(lines, range);
		if (body === null) throw new Error('The draw.io code block could not be read.');
		this.lastBody = body;
		return body;
	}

	async delete(): Promise<void> {
		this.writeChain = this.writeChain.catch(() => undefined).then(() => this.deleteNow());
		return this.writeChain;
	}

	async write(xml: string): Promise<void> {
		this.writeChain = this.writeChain.catch(() => undefined).then(() => this.writeNow(xml));
		return this.writeChain;
	}

	private getSourceFile(): TFile {
		const file = this.app.vault.getAbstractFileByPath(this.context.sourcePath);
		if (!(file instanceof TFile)) throw new Error('The source Markdown note no longer exists.');
		return file;
	}

	private locateCurrentRange(lines: string[]): DrawioBlockRange {
		const info = this.context.getSectionInfo(this.element);
		if (info) {
			const sectionRange = { start: info.lineStart, end: info.lineEnd };
			const sectionBody = getDrawioBlockBody(lines, sectionRange);
			if (sectionBody === this.lastBody.trim()) return sectionRange;
			if (sectionBody !== null) {
				throw new Error(
					'This draw.io code block changed. Refresh the note before opening it again.',
				);
			}
		}

		const matches = findDrawioBlocks(lines, this.lastBody);
		if (matches.length > 1) {
			throw new Error(
				'Multiple identical draw.io blocks were found and the original location is no longer reliable.',
			);
		}
		const range = matches[0];
		if (!range)
			throw new Error(
				'The draw.io code block moved or changed. Refresh the note before editing it.',
			);
		return range;
	}

	private async writeNow(xml: string): Promise<void> {
		validateDrawioXml(xml);
		const file = this.getSourceFile();
		const formatted = formatDrawioXml(xml);
		let replaced = false;

		await this.app.vault.process(file, (current) => {
			const lines = current.split(/\r?\n/);
			const range = this.locateCurrentRange(lines);
			replaced = true;
			return replaceDrawioBlockBody(current, range, formatted);
		});

		if (!replaced) throw new Error('The draw.io code block could not be updated.');
		this.lastBody = formatted;
	}

	private async deleteNow(): Promise<void> {
		const file = this.getSourceFile();
		let deleted = false;

		await this.app.vault.process(file, (current) => {
			const lines = current.split(/\r?\n/);
			const range = this.locateCurrentRange(lines);
			deleted = true;
			return removeDrawioBlock(current, range);
		});

		if (!deleted) throw new Error('The draw.io code block could not be deleted.');
	}
}
