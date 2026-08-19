const MAX_RASTER_DIMENSION = 8192;
const MAX_RASTER_PIXELS = 16_000_000;

export type PreviewImageFormat = 'jpeg' | 'png';

function canvasToBlob(
	canvas: HTMLCanvasElement,
	mimeType: 'image/jpeg' | 'image/png',
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error('Could not convert the diagram to an image.'));
			},
			mimeType,
			0.92,
		);
	});
}

export async function renderPreviewImage(
	image: HTMLImageElement,
	format: PreviewImageFormat,
): Promise<Blob> {
	if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
		await image.decode();
	}
	if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
		throw new Error('The diagram image is not ready yet.');
	}

	const scale = Math.min(
		1,
		MAX_RASTER_DIMENSION / image.naturalWidth,
		MAX_RASTER_DIMENSION / image.naturalHeight,
		Math.sqrt(MAX_RASTER_PIXELS / (image.naturalWidth * image.naturalHeight)),
	);
	const canvas = createEl('canvas');
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not prepare the diagram image.');

	if (format === 'jpeg') {
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	return canvasToBlob(canvas, format === 'png' ? 'image/png' : 'image/jpeg');
}

export async function copyPreviewImage(image: HTMLImageElement): Promise<void> {
	if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
		throw new Error('Copying images is not supported on this device.');
	}

	const blob = await renderPreviewImage(image, 'png');
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function copyPreviewXml(xml: string): Promise<void> {
	if (!navigator.clipboard?.writeText) {
		throw new Error('Copying text is not supported on this device.');
	}
	await navigator.clipboard.writeText(xml);
}
