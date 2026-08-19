import { App, ConfirmationModal, Notice } from 'obsidian';
import type { DrawioSource } from '../source/DrawioSource';

export function openDeleteDiagramModal(
	app: App,
	source: DrawioSource,
	onDeleted?: () => void,
): void {
	const modal = new ConfirmationModal(app)
		.setTitle('Delete diagram?')
		.setContent(source.deleteDescription());

	modal.addButton((button) =>
		button
			.setButtonText('Delete')
			.setDestructive()
			.setCta()
			.onClick(async () => {
				try {
					await source.delete();
					onDeleted?.();
					new Notice('draw.io Blocks: Deleted diagram.');
					return false;
				} catch (error) {
					new Notice(
						`draw.io Blocks: ${error instanceof Error ? error.message : String(error)}`,
						8000,
					);
					return true;
				}
			}),
	);
	modal.addCancelButton();
	modal.open();
}
