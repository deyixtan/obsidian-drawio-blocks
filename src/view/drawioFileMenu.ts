import { Notice, type App, type Menu, type TFile } from 'obsidian';
import { DrawioFileSource } from '../source/DrawioFileSource';
import type { DrawioSource } from '../source/DrawioSource';
import { addDiagramMenuItems } from './diagramMenu';

export interface DrawioFileMenuHost {
	app: App;
	openEditor(source: DrawioSource, onSaved?: (xml: string) => void): void;
	openEditorInTab(source: DrawioSource, onSaved?: (xml: string) => void): Promise<void>;
	openViewer(source: DrawioSource, imageUri: string, onSaved?: (xml: string) => void): void;
	openViewerInTab(
		source: DrawioSource,
		imageUri: string,
		onSaved?: (xml: string) => void,
	): Promise<void>;
	renderDiagram(xml: string): Promise<string>;
}

export function addDrawioFileMenu(host: DrawioFileMenuHost, menu: Menu, file: TFile): void {
	const source = new DrawioFileSource(host.app, file);
	const imageProvider = () => renderSourceImage(host, source);
	menu.addSeparator();
	addDiagramMenuItems(
		menu,
		{
			app: host.app,
			imageProvider,
			openEditor: (inTab) => {
				if (inTab) void host.openEditorInTab(source);
				else host.openEditor(source);
			},
			openViewer: (inTab) => void openRenderedViewer(host, source, inTab),
			source,
			xmlProvider: () => source.read(),
		},
		{ includeDelete: false },
	);
}

async function renderSourceImage(
	host: DrawioFileMenuHost,
	source: DrawioSource,
): Promise<HTMLImageElement> {
	const image = createEl('img');
	image.src = await host.renderDiagram(await source.read());
	return image;
}

async function openRenderedViewer(
	host: DrawioFileMenuHost,
	source: DrawioSource,
	inTab: boolean,
): Promise<void> {
	try {
		const imageUri = await host.renderDiagram(await source.read());
		if (inTab) await host.openViewerInTab(source, imageUri);
		else host.openViewer(source, imageUri);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`draw.io Blocks: ${message}`, 8000);
	}
}
