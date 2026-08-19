import { App, Menu, Notice } from 'obsidian';
import type { DrawioSource } from '../source/DrawioSource';
import { copyPreviewImage, copyPreviewXml } from './copyPreview';
import { openDeleteDiagramModal } from './DeleteDiagramModal';
import { SavePreviewImageModal } from './SavePreviewImageModal';

export interface DiagramMenuActions {
	app: App;
	imageProvider: () => Promise<HTMLImageElement>;
	onDeleted?: () => void;
	openEditor: (inTab: boolean) => void;
	openViewer: (inTab: boolean) => void;
	source: DrawioSource;
	xmlProvider: () => Promise<string>;
}

export interface DiagramMenuOptions {
	includeDelete?: boolean;
}

function showError(error: unknown): void {
	new Notice(`draw.io Blocks: ${error instanceof Error ? error.message : String(error)}`, 8000);
}

export function addDiagramMenuItems(
	menu: Menu,
	actions: DiagramMenuActions,
	options: DiagramMenuOptions = {},
): Menu {
	menu.addItem((item) => item.setTitle('View in modal').onClick(() => actions.openViewer(false)));
	menu.addItem((item) => item.setTitle('View in tab').onClick(() => actions.openViewer(true)));
	menu.addSeparator();
	menu.addItem((item) => item.setTitle('Edit in modal').onClick(() => actions.openEditor(false)));
	menu.addItem((item) => item.setTitle('Edit in tab').onClick(() => actions.openEditor(true)));
	menu.addSeparator();
	menu.addItem((item) =>
		item.setTitle('Copy image').onClick(() => {
			void actions
				.imageProvider()
				.then(copyPreviewImage)
				.then(() => new Notice('draw.io Blocks: Copied diagram image.'), showError);
		}),
	);
	menu.addItem((item) =>
		item.setTitle('Copy XML').onClick(() => {
			void actions
				.xmlProvider()
				.then(copyPreviewXml)
				.then(() => new Notice('draw.io Blocks: Copied diagram XML.'), showError);
		}),
	);
	menu.addSeparator();
	menu.addItem((item) =>
		item.setTitle('Save image').onClick(() => {
			new SavePreviewImageModal(
				actions.app,
				actions.imageProvider,
				actions.xmlProvider,
				actions.source.suggestedImagePath?.('png') ?? 'drawio-diagram.png',
			).open();
		}),
	);
	if (options.includeDelete !== false) {
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Delete diagram')
				.setWarning(true)
				.onClick(() =>
					openDeleteDiagramModal(actions.app, actions.source, actions.onDeleted),
				),
		);
	}
	return menu;
}

export function createDiagramMenu(actions: DiagramMenuActions): Menu {
	return addDiagramMenuItems(new Menu().setNoIcon(), actions);
}
