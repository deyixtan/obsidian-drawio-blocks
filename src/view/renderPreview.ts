import { setIcon } from 'obsidian';
import type DrawioBlocksPlugin from '../main';
import type { DrawioSource } from '../source/DrawioSource';

export interface PreviewHandle {
	refresh(): void;
	destroy(): void;
}

export function mountPreview(
	plugin: DrawioBlocksPlugin,
	container: HTMLElement,
	source: DrawioSource,
	xmlProvider: () => Promise<string>,
): PreviewHandle {
	let generation = 0;
	let destroyed = false;

	container.empty();
	container.addClass('drawio-blocks-preview-card');

	// Obsidian themes can style the original fenced-code <pre> and all images
	// with rounded corners. Mark the actual host so the preview CSS can reset
	// both layers rather than only the plugin's inner wrapper.
	const codeBlockHost = container.closest('pre');
	codeBlockHost?.addClass('drawio-blocks-codeblock-host');

	const imageWrap = container.createDiv({ cls: 'drawio-blocks-image-wrap' });
	const status = imageWrap.createDiv({
		cls: 'drawio-blocks-preview-status',
		text: 'Rendering diagram…',
	});
	const image = imageWrap.createEl('img', {
		cls: 'drawio-blocks-preview-image',
		attr: { alt: source.title() },
	});
	const editButton = imageWrap.createEl('button', {
		cls: 'drawio-blocks-edit-button',
		attr: { 'aria-label': 'Edit diagram' },
	});
	setIcon(editButton, 'pencil');

	const refresh = (): void => {
		const current = ++generation;
		status.setText('Rendering diagram…');
		status.removeClass('is-error');
		image.addClass('is-loading');
		image.removeAttribute('src');

		void xmlProvider()
			.then((xml) => plugin.previewService.render(xml, { dark: plugin.isDark() }))
			.then((uri) => {
				if (destroyed || current !== generation) return;
				image.src = uri;
				image.removeClass('is-loading');
				status.setText('');
			})
			.catch((error: unknown) => {
				if (destroyed || current !== generation) return;
				image.removeClass('is-loading');
				status.addClass('is-error');
				status.setText(error instanceof Error ? error.message : String(error));
			});
	};

	const openEditor = (): void => plugin.openEditor(source, refresh);
	const onEditClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		openEditor();
	};
	const onWrapClick = (): void => openEditor();
	const onWrapKeydown = (event: KeyboardEvent): void => {
		if (event.target !== imageWrap) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openEditor();
		}
	};

	editButton.addEventListener('click', onEditClick);
	imageWrap.addEventListener('click', onWrapClick);
	imageWrap.addEventListener('keydown', onWrapKeydown);
	imageWrap.tabIndex = 0;
	imageWrap.setAttribute('role', 'button');
	imageWrap.setAttribute('aria-label', `Edit ${source.title()}`);

	refresh();

	return {
		refresh,
		destroy: () => {
			destroyed = true;
			generation += 1;
			editButton.removeEventListener('click', onEditClick);
			imageWrap.removeEventListener('click', onWrapClick);
			imageWrap.removeEventListener('keydown', onWrapKeydown);
			image.removeAttribute('src');
			codeBlockHost?.removeClass('drawio-blocks-codeblock-host');
		},
	};
}
