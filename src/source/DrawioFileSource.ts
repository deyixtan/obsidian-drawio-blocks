import { App, TFile } from 'obsidian';
import { validateDrawioXml } from '../utils/xml';
import type { DrawioSource } from './DrawioSource';

export class DrawioFileSource implements DrawioSource {
	private writeChain: Promise<void> = Promise.resolve();

	constructor(
		private readonly app: App,
		readonly file: TFile,
	) {}

	title(): string {
		return this.file.basename;
	}

	deleteDescription(): string {
		return `This moves “${this.file.path}” to the trash.`;
	}

	suggestedImagePath(extension: string): string {
		const separator = this.file.path.lastIndexOf('/');
		const directory = separator >= 0 ? this.file.path.slice(0, separator + 1) : '';
		return `${directory}${this.file.basename}-export.${extension}`;
	}

	read(): Promise<string> {
		return this.app.vault.read(this.file);
	}

	async write(xml: string): Promise<void> {
		validateDrawioXml(xml);
		this.writeChain = this.writeChain
			.catch(() => undefined)
			.then(async () => {
				await this.app.vault.process(this.file, () => xml);
			});
		return this.writeChain;
	}

	async delete(): Promise<void> {
		this.writeChain = this.writeChain
			.catch(() => undefined)
			.then(() => this.app.fileManager.trashFile(this.file));
		return this.writeChain;
	}
}
