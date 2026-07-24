import { Editor, MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { DrawioModal } from './editor/DrawioModal';
import { SimpleCodeBlockSource } from './source/SimpleCodeBlockSource';
import { EMPTY_DRAWIO_XML } from './constants';

export default class DrawioBlocksPlugin extends Plugin {
	async onload() {
		this.registerMarkdownCodeBlockProcessor(
			'drawio',
			(source, element, context) => {
				this.renderDrawioBlock(source, element, context);
			},
		);

		this.addCommand({
			id: 'insert-drawio-code-block',
			name: 'Insert inline draw.io diagram',
			editorCallback: (editor: Editor) => {
				editor.replaceSelection(
					`\n\`\`\`drawio\n${EMPTY_DRAWIO_XML}\n\`\`\`\n`,
				);
			},
		});
	}

	onunload() {}

	private renderDrawioBlock(
		xml: string,
		element: HTMLElement,
		context: MarkdownPostProcessorContext,
	): void {
		element.empty();
		const card = element.createDiv({ cls: 'drawio-mvp-card' });
		card.createEl('strong', { text: 'draw.io diagram' });
		card.createEl('p', {
			text: 'Preview rendering will be added after the MVP.',
		});

		const source = new SimpleCodeBlockSource(
			this.app,
			context,
			element,
			xml,
		);

		const button = card.createEl('button', { text: 'Edit diagram' });
		button.addEventListener('click', () => {
			new DrawioModal(this.app, source).open();
		});
	}
}
