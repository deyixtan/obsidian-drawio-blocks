import type DrawioBlocksPlugin from '../main';
import type { DrawioSource } from '../source/DrawioSource';
import { isDrawioDiagramEmpty } from '../utils/xml';

export interface PreviewHandle {
	refresh(): void;
	updateAppearance(): void;
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

	const imageWrap = container.createDiv({
		cls: 'drawio-blocks-image-wrap',
		attr: {
			role: 'group',
			tabindex: '0',
			'aria-label': `${source.title()} preview. Select to show editor actions.`,
		},
	});
	const status = imageWrap.createDiv({
		cls: 'drawio-blocks-preview-status',
		text: 'Rendering diagram…',
	});
	const image = imageWrap.createEl('img', {
		cls: 'drawio-blocks-preview-image',
		attr: { alt: source.title() },
	});
	const actions = imageWrap.createDiv({ cls: 'drawio-blocks-preview-actions' });
	const editButton = actions.createEl('button', {
		cls: 'drawio-blocks-preview-action',
		text: 'Open in modal',
		attr: { type: 'button', 'aria-label': `Open ${source.title()} in a modal` },
	});
	const tabButton = actions.createEl('button', {
		cls: 'drawio-blocks-preview-action',
		text: 'Open in tab',
		attr: { type: 'button', 'aria-label': `Open ${source.title()} in a new tab` },
	});

	image.draggable = false;

	const updateEmptyPreviewHeight = (): void => {
		const view = container.ownerDocument.defaultView;
		const style = view?.getComputedStyle(codeBlockHost ?? container);
		const lineHeight = Number.parseFloat(style?.lineHeight ?? '');
		const fontSize = Number.parseFloat(style?.fontSize ?? '');
		const height = Number.isFinite(lineHeight)
			? lineHeight
			: Number.isFinite(fontSize)
				? fontSize * 1.5
				: 24;
		container.style.setProperty('--drawio-blocks-empty-preview-height', `${height}px`);
	};

	const updateAppearance = (): void => {
		updateEmptyPreviewHeight();
		imageWrap.style.setProperty(
			'--drawio-blocks-preview-border-color',
			plugin.previewBorderColor,
		);
		imageWrap.style.setProperty(
			'--drawio-blocks-preview-grid-color',
			`${plugin.previewBorderColor}3d`,
		);
		imageWrap.classList.toggle('has-grid', plugin.showPreviewGrid);
	};

	const refresh = (): void => {
		if (destroyed) return;
		const current = ++generation;
		status.setText('Rendering diagram…');
		status.removeClass('is-error');
		imageWrap.removeClass('has-preview', 'has-error');
		image.addClass('is-loading');
		image.addClass('is-unavailable');
		image.removeAttribute('src');

		void xmlProvider()
			.then((xml) => {
				const empty = isDrawioDiagramEmpty(xml);
				container.toggleClass('is-empty', empty);
				imageWrap.toggleClass('is-empty', empty);
				return plugin.previewService.render(xml, { dark: plugin.isDark() });
			})
			.then((uri) => {
				if (destroyed || current !== generation) return;
				image.src = uri;
				image.removeClass('is-loading');
				image.removeClass('is-unavailable');
				imageWrap.addClass('has-preview');
				status.setText('');
			})
			.catch((error: unknown) => {
				if (destroyed || current !== generation) return;
				image.removeClass('is-loading');
				image.addClass('is-unavailable');
				imageWrap.addClass('has-error');
				status.addClass('is-error');
				status.setText(error instanceof Error ? error.message : String(error));
			});
	};

	const openEditor = (inTab: boolean): void => {
		window.setTimeout(() => {
			if (!destroyed) {
				if (inTab) void plugin.openEditorInTab(source, refresh);
				else plugin.openEditor(source, refresh);
			}
		}, 0);
	};

	const onEditClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		openEditor(false);
	};

	const onTabClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		openEditor(true);
	};
	const onPreviewClick = (): void => {
		if (imageWrap.hasClass('has-preview') || imageWrap.hasClass('has-error')) {
			imageWrap.focus({ preventScroll: true });
		}
	};

	editButton.addEventListener('click', onEditClick);
	tabButton.addEventListener('click', onTabClick);
	imageWrap.addEventListener('click', onPreviewClick);

	updateAppearance();
	refresh();

	return {
		refresh,
		updateAppearance,
		destroy: () => {
			destroyed = true;
			generation += 1;
			editButton.removeEventListener('click', onEditClick);
			tabButton.removeEventListener('click', onTabClick);
			imageWrap.removeEventListener('click', onPreviewClick);
			image.removeAttribute('src');
			container.style.removeProperty('--drawio-blocks-empty-preview-height');
			imageWrap.style.removeProperty('--drawio-blocks-preview-border-color');
			imageWrap.style.removeProperty('--drawio-blocks-preview-grid-color');
			codeBlockHost?.removeClass('drawio-blocks-codeblock-host');
		},
	};
}
