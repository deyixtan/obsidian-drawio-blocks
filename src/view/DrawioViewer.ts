import { setIcon } from 'obsidian';

const FIT_PADDING = 24;
const MAX_SCALE = 16;
const MIN_SCALE = 0.01;
const ZOOM_FACTOR = 1.25;

export const DRAWIO_VIEWER_TITLE = 'draw.io Viewer';

interface PointerPosition {
	x: number;
	y: number;
}

export class DrawioViewer {
	private closeButton: HTMLButtonElement | null = null;
	private fitButton: HTMLButtonElement | null = null;
	private gestureStartDistance = 0;
	private gestureStartImageX = 0;
	private gestureStartImageY = 0;
	private gestureStartOffsetX = 0;
	private gestureStartOffsetY = 0;
	private gestureStartScale = 1;
	private gestureStartX = 0;
	private gestureStartY = 0;
	private hasUserTransform = false;
	private image: HTMLImageElement | null = null;
	private minimumScale = MIN_SCALE;
	private offsetX = 0;
	private offsetY = 0;
	private readonly pointers = new Map<number, PointerPosition>();
	private resizeFrame: number | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private scale = 1;
	private shell: HTMLElement | null = null;
	private status: HTMLElement | null = null;
	private viewport: HTMLElement | null = null;
	private zoomInButton: HTMLButtonElement | null = null;
	private zoomLabel: HTMLElement | null = null;
	private zoomLabelText = '';
	private zoomOutButton: HTMLButtonElement | null = null;
	private viewerWindow: Window | null = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly title: string,
		private readonly imageUri: string,
		private readonly requestClose?: () => void,
	) {}

	mount(): void {
		this.destroy();
		this.container.empty();
		this.shell = this.container.createDiv({ cls: 'drawio-blocks-viewer-shell' });
		const toolbar = this.shell.createDiv({ cls: 'drawio-blocks-viewer-toolbar' });
		toolbar.createDiv({ cls: 'drawio-blocks-viewer-title', text: DRAWIO_VIEWER_TITLE });
		const controls = toolbar.createDiv({ cls: 'drawio-blocks-viewer-controls' });

		this.zoomOutButton = controls.createEl('button', {
			text: '−',
			attr: { type: 'button', 'aria-label': 'Zoom out' },
		});
		this.zoomLabel = controls.createSpan({
			cls: 'drawio-blocks-viewer-zoom',
			text: '100%',
			attr: { 'aria-live': 'polite' },
		});
		this.zoomInButton = controls.createEl('button', {
			text: '+',
			attr: { type: 'button', 'aria-label': 'Zoom in' },
		});
		this.fitButton = controls.createEl('button', {
			text: 'Fit',
			attr: { type: 'button', 'aria-label': 'Fit diagram to viewer' },
		});
		if (this.requestClose) {
			this.closeButton = controls.createEl('button', {
				cls: 'drawio-blocks-viewer-close',
				attr: { type: 'button', 'aria-label': 'Close viewer' },
			});
			setIcon(this.closeButton, 'x');
		}

		this.viewport = this.shell.createDiv({
			cls: 'drawio-blocks-viewer-viewport',
			attr: {
				role: 'group',
				tabindex: '0',
				'aria-label': 'Diagram viewer. Drag to pan, pinch or use the controls to zoom.',
			},
		});
		this.status = this.viewport.createDiv({
			cls: 'drawio-blocks-viewer-status',
			text: 'Loading diagram…',
			attr: { 'aria-live': 'polite' },
		});
		this.image = this.viewport.createEl('img', {
			cls: 'drawio-blocks-viewer-image',
			attr: { alt: this.title },
		});
		this.image.draggable = false;

		this.image.addEventListener('load', this.onImageLoad);
		this.image.addEventListener('error', this.onImageError);
		this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
		this.viewport.addEventListener('pointerdown', this.onPointerDown);
		this.viewport.addEventListener('pointermove', this.onPointerMove);
		this.viewport.addEventListener('pointerup', this.onPointerEnd);
		this.viewport.addEventListener('pointercancel', this.onPointerEnd);
		this.viewport.addEventListener('touchstart', this.onTouchEvent, { passive: false });
		this.viewport.addEventListener('touchmove', this.onTouchEvent, { passive: false });
		this.viewport.addEventListener('touchend', this.onTouchEvent, { passive: false });
		this.viewport.addEventListener('touchcancel', this.onTouchEvent, { passive: false });
		this.zoomOutButton.addEventListener('click', this.onZoomOut);
		this.zoomInButton.addEventListener('click', this.onZoomIn);
		this.fitButton.addEventListener('click', this.onFit);
		this.closeButton?.addEventListener('click', this.onClose);

		this.viewerWindow = this.container.ownerDocument.defaultView;
		this.resizeObserver = new ResizeObserver(this.onResize);
		this.resizeObserver.observe(this.viewport);
		this.image.src = this.imageUri;
	}

	destroy(): void {
		if (this.resizeFrame !== null) {
			this.viewerWindow?.cancelAnimationFrame(this.resizeFrame);
			this.resizeFrame = null;
		}
		this.resizeObserver?.disconnect();
		this.image?.removeEventListener('load', this.onImageLoad);
		this.image?.removeEventListener('error', this.onImageError);
		this.viewport?.removeEventListener('wheel', this.onWheel);
		this.viewport?.removeEventListener('pointerdown', this.onPointerDown);
		this.viewport?.removeEventListener('pointermove', this.onPointerMove);
		this.viewport?.removeEventListener('pointerup', this.onPointerEnd);
		this.viewport?.removeEventListener('pointercancel', this.onPointerEnd);
		this.viewport?.removeEventListener('touchstart', this.onTouchEvent);
		this.viewport?.removeEventListener('touchmove', this.onTouchEvent);
		this.viewport?.removeEventListener('touchend', this.onTouchEvent);
		this.viewport?.removeEventListener('touchcancel', this.onTouchEvent);
		this.zoomOutButton?.removeEventListener('click', this.onZoomOut);
		this.zoomInButton?.removeEventListener('click', this.onZoomIn);
		this.fitButton?.removeEventListener('click', this.onFit);
		this.closeButton?.removeEventListener('click', this.onClose);
		this.image?.removeAttribute('src');
		this.shell?.remove();

		this.closeButton = null;
		this.fitButton = null;
		this.image = null;
		this.resizeObserver = null;
		this.shell = null;
		this.status = null;
		this.viewport = null;
		this.zoomInButton = null;
		this.zoomLabel = null;
		this.zoomOutButton = null;
		this.hasUserTransform = false;
		this.pointers.clear();
		this.zoomLabelText = '';
		this.viewerWindow = null;
	}

	private readonly onImageLoad = (): void => {
		this.status?.remove();
		this.status = null;
		this.hasUserTransform = false;
		this.scheduleFit();
	};

	private readonly onImageError = (): void => {
		this.status?.setText('Could not load the diagram preview.');
		this.status?.addClass('is-error');
	};

	private readonly onResize = (): void => {
		if (!this.hasUserTransform) this.scheduleFit();
	};

	private readonly onFit = (): void => {
		this.cancelScheduledFit();
		this.hasUserTransform = false;
		this.fit();
	};

	private readonly onClose = (): void => {
		this.requestClose?.();
	};

	private readonly onZoomIn = (): void => {
		this.beginUserTransform();
		this.zoomAt(this.scale * ZOOM_FACTOR);
	};

	private readonly onZoomOut = (): void => {
		this.beginUserTransform();
		this.zoomAt(this.scale / ZOOM_FACTOR);
	};

	private readonly onWheel = (event: WheelEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		this.beginUserTransform();
		const factor = Math.exp(-event.deltaY * 0.002);
		this.zoomAt(this.scale * factor, event.clientX, event.clientY);
	};

	private readonly onPointerDown = (event: PointerEvent): void => {
		if (!this.viewport || event.button !== 0) return;
		if (event.pointerType === 'mouse' && !event.isPrimary) return;

		event.preventDefault();
		event.stopPropagation();
		this.beginUserTransform();
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		this.viewport.setPointerCapture(event.pointerId);
		this.restartGesture();
		this.viewport.addClass('is-panning');
		this.viewport.focus({ preventScroll: true });
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (!this.pointers.has(event.pointerId)) return;

		event.preventDefault();
		event.stopPropagation();
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		this.applyGesture();
	};

	private readonly onPointerEnd = (event: PointerEvent): void => {
		if (!this.viewport || !this.pointers.has(event.pointerId)) return;

		event.preventDefault();
		event.stopPropagation();
		if (this.viewport.hasPointerCapture(event.pointerId)) {
			this.viewport.releasePointerCapture(event.pointerId);
		}
		this.pointers.delete(event.pointerId);
		if (this.pointers.size > 0) this.restartGesture();
		else this.viewport.removeClass('is-panning');
	};

	private readonly onTouchEvent = (event: TouchEvent): void => {
		if (event.cancelable) event.preventDefault();
		event.stopPropagation();
	};

	private restartGesture(): void {
		if (!this.viewport) return;
		const [first, second] = [...this.pointers.values()];
		if (!first) return;

		this.gestureStartOffsetX = this.offsetX;
		this.gestureStartOffsetY = this.offsetY;
		this.gestureStartX = first.x;
		this.gestureStartY = first.y;
		if (!second) return;

		const bounds = this.viewport.getBoundingClientRect();
		const centerX = (first.x + second.x) / 2 - bounds.left;
		const centerY = (first.y + second.y) / 2 - bounds.top;
		this.gestureStartDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
		this.gestureStartScale = this.scale;
		this.gestureStartImageX = (centerX - this.offsetX) / this.scale;
		this.gestureStartImageY = (centerY - this.offsetY) / this.scale;
	}

	private applyGesture(): void {
		if (!this.viewport) return;
		const [first, second] = [...this.pointers.values()];
		if (!first) return;

		if (!second) {
			this.offsetX = this.gestureStartOffsetX + first.x - this.gestureStartX;
			this.offsetY = this.gestureStartOffsetY + first.y - this.gestureStartY;
			this.updateTransform();
			return;
		}

		const bounds = this.viewport.getBoundingClientRect();
		const centerX = (first.x + second.x) / 2 - bounds.left;
		const centerY = (first.y + second.y) / 2 - bounds.top;
		const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
		this.scale = this.constrainScale(
			this.gestureStartScale * (distance / this.gestureStartDistance),
		);
		this.offsetX = centerX - this.gestureStartImageX * this.scale;
		this.offsetY = centerY - this.gestureStartImageY * this.scale;
		this.updateTransform();
	}

	private scheduleFit(): void {
		if (!this.viewerWindow) {
			this.fit();
			return;
		}
		if (this.resizeFrame !== null) this.viewerWindow.cancelAnimationFrame(this.resizeFrame);
		this.resizeFrame = this.viewerWindow.requestAnimationFrame(() => {
			this.resizeFrame = null;
			this.fit();
		});
	}

	private cancelScheduledFit(): void {
		if (this.resizeFrame === null) return;
		this.viewerWindow?.cancelAnimationFrame(this.resizeFrame);
		this.resizeFrame = null;
	}

	private beginUserTransform(): void {
		this.cancelScheduledFit();
		this.hasUserTransform = true;
	}

	private fit(): void {
		if (!this.image || !this.viewport) return;

		const imageWidth = this.image.naturalWidth;
		const imageHeight = this.image.naturalHeight;
		const viewportWidth = this.viewport.clientWidth;
		const viewportHeight = this.viewport.clientHeight;
		if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0)
			return;

		const availableWidth = Math.max(1, viewportWidth - FIT_PADDING * 2);
		const availableHeight = Math.max(1, viewportHeight - FIT_PADDING * 2);
		const fittedScale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight, 1);
		this.minimumScale = Math.min(MIN_SCALE, fittedScale);
		this.scale = fittedScale;
		this.offsetX = (viewportWidth - imageWidth * this.scale) / 2;
		this.offsetY = (viewportHeight - imageHeight * this.scale) / 2;
		this.updateTransform();
	}

	private zoomAt(nextScale: number, clientX?: number, clientY?: number): void {
		if (!this.viewport) return;

		const scale = this.constrainScale(nextScale);
		if (scale === this.scale) return;

		const bounds = this.viewport.getBoundingClientRect();
		const anchorX = (clientX ?? bounds.left + bounds.width / 2) - bounds.left;
		const anchorY = (clientY ?? bounds.top + bounds.height / 2) - bounds.top;
		const imageX = (anchorX - this.offsetX) / this.scale;
		const imageY = (anchorY - this.offsetY) / this.scale;

		this.scale = scale;
		this.offsetX = anchorX - imageX * this.scale;
		this.offsetY = anchorY - imageY * this.scale;
		this.updateTransform();
	}

	private constrainScale(scale: number): number {
		return Math.min(MAX_SCALE, Math.max(this.minimumScale, scale));
	}

	private updateTransform(): void {
		if (!this.image) return;
		this.image.style.transform = `translate3d(${this.offsetX}px, ${this.offsetY}px, 0) scale(${this.scale})`;
		const zoomLabelText = `${Math.round(this.scale * 100)}%`;
		if (zoomLabelText !== this.zoomLabelText) {
			this.zoomLabelText = zoomLabelText;
			this.zoomLabel?.setText(zoomLabelText);
		}
	}
}
