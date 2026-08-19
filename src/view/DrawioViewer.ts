const FIT_PADDING = 24;
const MAX_SCALE = 16;
const MIN_SCALE = 0.01;
const ZOOM_FACTOR = 1.25;

export class DrawioViewer {
	private fitButton: HTMLButtonElement | null = null;
	private hasUserTransform = false;
	private image: HTMLImageElement | null = null;
	private minimumScale = MIN_SCALE;
	private offsetX = 0;
	private offsetY = 0;
	private pointerId: number | null = null;
	private pointerStartX = 0;
	private pointerStartY = 0;
	private pointerStartOffsetX = 0;
	private pointerStartOffsetY = 0;
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
	) {}

	mount(): void {
		this.destroy();
		this.container.empty();
		this.shell = this.container.createDiv({ cls: 'drawio-blocks-viewer-shell' });
		const toolbar = this.shell.createDiv({ cls: 'drawio-blocks-viewer-toolbar' });
		toolbar.createDiv({ cls: 'drawio-blocks-viewer-title', text: this.title });
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

		this.viewport = this.shell.createDiv({
			cls: 'drawio-blocks-viewer-viewport',
			attr: {
				role: 'group',
				tabindex: '0',
				'aria-label': 'Diagram viewer. Drag to pan and use the controls to zoom.',
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
		this.zoomOutButton.addEventListener('click', this.onZoomOut);
		this.zoomInButton.addEventListener('click', this.onZoomIn);
		this.fitButton.addEventListener('click', this.onFit);

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
		this.zoomOutButton?.removeEventListener('click', this.onZoomOut);
		this.zoomInButton?.removeEventListener('click', this.onZoomIn);
		this.fitButton?.removeEventListener('click', this.onFit);
		this.image?.removeAttribute('src');
		this.shell?.remove();

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
		this.beginUserTransform();
		const factor = Math.exp(-event.deltaY * 0.002);
		this.zoomAt(this.scale * factor, event.clientX, event.clientY);
	};

	private readonly onPointerDown = (event: PointerEvent): void => {
		if (!this.viewport || !event.isPrimary || event.button !== 0) return;

		event.preventDefault();
		this.beginUserTransform();
		this.pointerId = event.pointerId;
		this.pointerStartX = event.clientX;
		this.pointerStartY = event.clientY;
		this.pointerStartOffsetX = this.offsetX;
		this.pointerStartOffsetY = this.offsetY;
		this.viewport.setPointerCapture(event.pointerId);
		this.viewport.addClass('is-panning');
		this.viewport.focus({ preventScroll: true });
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (event.pointerId !== this.pointerId) return;

		this.offsetX = this.pointerStartOffsetX + event.clientX - this.pointerStartX;
		this.offsetY = this.pointerStartOffsetY + event.clientY - this.pointerStartY;
		this.updateTransform();
	};

	private readonly onPointerEnd = (event: PointerEvent): void => {
		if (!this.viewport || event.pointerId !== this.pointerId) return;

		if (this.viewport.hasPointerCapture(event.pointerId)) {
			this.viewport.releasePointerCapture(event.pointerId);
		}
		this.pointerId = null;
		this.viewport.removeClass('is-panning');
	};

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

		const scale = Math.min(MAX_SCALE, Math.max(this.minimumScale, nextScale));
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
