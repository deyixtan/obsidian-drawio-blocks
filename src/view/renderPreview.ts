import { Menu, Notice } from 'obsidian';
import type DrawioBlocksPlugin from '../main';
import type { DrawioSource } from '../source/DrawioSource';
import { isDrawioDiagramEmpty } from '../utils/xml';
import { copyPreviewImage, copyPreviewXml } from './copyPreview';
import { SavePreviewImageModal } from './SavePreviewImageModal';

let previewLabelCounter = 0;

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

	const accessibleLabelId = `drawio-blocks-preview-label-${++previewLabelCounter}`;
	const imageWrap = container.createDiv({
		cls: 'drawio-blocks-image-wrap',
		attr: {
			role: 'group',
			tabindex: '0',
			'aria-labelledby': accessibleLabelId,
		},
	});
	imageWrap.createSpan({
		cls: 'drawio-blocks-visually-hidden',
		text: `${source.title()} preview. Select to show View and Edit. Right-click or press and hold for more actions.`,
		attr: { id: accessibleLabelId },
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
	const viewButton = actions.createEl('button', {
		cls: 'drawio-blocks-preview-action',
		text: 'View',
		attr: { type: 'button' },
	});
	const editButton = actions.createEl('button', {
		cls: 'drawio-blocks-preview-action',
		text: 'Edit',
		attr: { type: 'button' },
	});
	viewButton.disabled = true;

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
		viewButton.setAttribute(
			'aria-label',
			`View ${source.title()} in ${plugin.defaultViewDestination === 'tab' ? 'a tab' : 'a modal'}`,
		);
		editButton.setAttribute(
			'aria-label',
			`Edit ${source.title()} in ${plugin.defaultEditDestination === 'tab' ? 'a tab' : 'a modal'}`,
		);
		container.style.setProperty(
			'--drawio-blocks-preview-border-color',
			plugin.previewBorderColor,
		);
		container.style.setProperty(
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
		viewButton.disabled = true;

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
				viewButton.disabled = false;
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

	const openViewer = (inTab: boolean): void => {
		const imageUri = image.src;
		if (!imageUri || viewButton.disabled) return;

		window.setTimeout(() => {
			if (!destroyed) {
				if (inTab) void plugin.openViewerInTab(source.title(), imageUri);
				else plugin.openViewer(source.title(), imageUri);
			}
		}, 0);
	};

	const onViewClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		openViewer(plugin.defaultViewDestination === 'tab');
	};

	const onEditClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		openEditor(plugin.defaultEditDestination === 'tab');
	};

	const createActionsMenu = (): Menu => {
		const menu = new Menu().setNoIcon();
		menu.addItem((item) => item.setTitle('View in modal').onClick(() => openViewer(false)));
		menu.addItem((item) => item.setTitle('View in tab').onClick(() => openViewer(true)));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle('Edit in modal').onClick(() => openEditor(false)));
		menu.addItem((item) => item.setTitle('Edit in tab').onClick(() => openEditor(true)));
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle('Copy image').onClick(() => {
				void copyPreviewImage(image).then(
					() => new Notice('draw.io Blocks: Copied diagram image.'),
					(error: unknown) =>
						new Notice(
							`draw.io Blocks: ${error instanceof Error ? error.message : String(error)}`,
							8000,
						),
				);
			}),
		);
		menu.addItem((item) =>
			item.setTitle('Copy XML').onClick(() => {
				void xmlProvider()
					.then(copyPreviewXml)
					.then(
						() => new Notice('draw.io Blocks: Copied diagram XML.'),
						(error: unknown) =>
							new Notice(
								`draw.io Blocks: ${error instanceof Error ? error.message : String(error)}`,
								8000,
							),
					);
			}),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle('Save image…').onClick(() => {
				new SavePreviewImageModal(
					plugin.app,
					image,
					source.suggestedImagePath?.('png') ?? 'drawio-diagram.png',
				).open();
			}),
		);
		return menu;
	};

	const onContextMenu = (event: MouseEvent): void => {
		if (!imageWrap.hasClass('has-preview') || !image.src) return;
		clearLongPress();
		event.preventDefault();
		event.stopPropagation();
		if (Date.now() < suppressContextMenuUntil) return;
		createActionsMenu().showAtMouseEvent(event);
	};

	const longPressDelay = 550;
	const longPressMovement = 12;
	const postLongPressSuppression = 1000;
	let longPressTimer: number | null = null;
	let longPressPointerId: number | null = null;
	let longPressOrigin: { x: number; y: number } | null = null;
	let suppressClickUntil = 0;
	let suppressContextMenuUntil = 0;

	function clearLongPress(): void {
		if (longPressTimer !== null) window.clearTimeout(longPressTimer);
		longPressTimer = null;
		longPressPointerId = null;
		longPressOrigin = null;
	}

	const onPointerDown = (event: PointerEvent): void => {
		if (event.pointerType !== 'touch' || !imageWrap.hasClass('has-preview') || !image.src) {
			return;
		}

		clearLongPress();
		const pointerId = event.pointerId;
		const x = event.clientX;
		const y = event.clientY;
		longPressPointerId = pointerId;
		longPressOrigin = { x, y };
		longPressTimer = window.setTimeout(() => {
			if (longPressPointerId !== pointerId) return;
			clearLongPress();
			const suppressUntil = Date.now() + postLongPressSuppression;
			suppressClickUntil = suppressUntil;
			suppressContextMenuUntil = suppressUntil;
			createActionsMenu().showAtPosition({ x, y }, imageWrap.ownerDocument);
		}, longPressDelay);
	};

	const onPointerMove = (event: PointerEvent): void => {
		if (event.pointerId !== longPressPointerId || !longPressOrigin) return;
		if (
			Math.hypot(event.clientX - longPressOrigin.x, event.clientY - longPressOrigin.y) >
			longPressMovement
		) {
			clearLongPress();
		}
	};

	const onPointerEnd = (event: PointerEvent): void => {
		if (event.pointerId === longPressPointerId) clearLongPress();
	};

	const onPreviewKeyDown = (event: KeyboardEvent): void => {
		if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
		if (!imageWrap.hasClass('has-preview') || !image.src) return;

		event.preventDefault();
		event.stopPropagation();
		const bounds = imageWrap.getBoundingClientRect();
		createActionsMenu().showAtPosition(
			{ x: bounds.left + Math.min(48, bounds.width / 2), y: bounds.top + 48 },
			imageWrap.ownerDocument,
		);
	};

	const onPreviewClick = (event: MouseEvent): void => {
		if (Date.now() < suppressClickUntil) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (imageWrap.hasClass('has-preview') || imageWrap.hasClass('has-error')) {
			imageWrap.focus({ preventScroll: true });
		}
	};

	viewButton.addEventListener('click', onViewClick);
	editButton.addEventListener('click', onEditClick);
	imageWrap.addEventListener('click', onPreviewClick);
	imageWrap.addEventListener('contextmenu', onContextMenu);
	imageWrap.addEventListener('pointerdown', onPointerDown);
	imageWrap.addEventListener('pointermove', onPointerMove);
	imageWrap.addEventListener('pointerup', onPointerEnd);
	imageWrap.addEventListener('pointercancel', onPointerEnd);
	imageWrap.addEventListener('keydown', onPreviewKeyDown);

	updateAppearance();
	refresh();

	return {
		refresh,
		updateAppearance,
		destroy: () => {
			destroyed = true;
			generation += 1;
			clearLongPress();
			viewButton.removeEventListener('click', onViewClick);
			editButton.removeEventListener('click', onEditClick);
			imageWrap.removeEventListener('click', onPreviewClick);
			imageWrap.removeEventListener('contextmenu', onContextMenu);
			imageWrap.removeEventListener('pointerdown', onPointerDown);
			imageWrap.removeEventListener('pointermove', onPointerMove);
			imageWrap.removeEventListener('pointerup', onPointerEnd);
			imageWrap.removeEventListener('pointercancel', onPointerEnd);
			imageWrap.removeEventListener('keydown', onPreviewKeyDown);
			image.removeAttribute('src');
			container.style.removeProperty('--drawio-blocks-empty-preview-height');
			container.style.removeProperty('--drawio-blocks-preview-border-color');
			container.style.removeProperty('--drawio-blocks-preview-grid-color');
			codeBlockHost?.removeClass('drawio-blocks-codeblock-host');
		},
	};
}
