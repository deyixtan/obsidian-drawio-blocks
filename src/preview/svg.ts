function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 0x8000;

	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}

	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

function hasUnsafeCss(value: string): boolean {
	if (/javascript\s*:|vbscript\s*:|@import|expression\s*\(/i.test(value)) {
		return true;
	}

	for (const match of value.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
		if (!isAllowedResource(match[2] ?? '')) return true;
	}

	return false;
}

function isAllowedResource(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (normalized.startsWith('#')) return true;
	return (
		normalized.startsWith('data:image/') ||
		normalized.startsWith('data:font/') ||
		normalized.startsWith('data:application/font')
	);
}

export function decodeSvgDataUri(uri: string): string {
	const comma = uri.indexOf(',');
	if (comma < 0 || !uri.slice(0, comma).toLowerCase().includes('image/svg+xml')) {
		throw new Error('diagrams.net did not return an SVG preview.');
	}

	const metadata = uri.slice(0, comma);
	const payload = uri.slice(comma + 1);
	if (/;base64/i.test(metadata)) {
		return new TextDecoder().decode(base64ToBytes(payload));
	}
	return decodeURIComponent(payload);
}

export function encodeSvgDataUri(svg: string): string {
	return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`;
}

export function sanitizeSvgDataUri(uri: string): string {
	const svg = decodeSvgDataUri(uri);
	const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
	if (doc.querySelector('parsererror')) {
		throw new Error('The generated SVG preview is invalid.');
	}

	doc.querySelectorAll('script, iframe, object, embed, audio, video, link, base, meta').forEach(
		(node) => node.remove(),
	);

	doc.querySelectorAll('style').forEach((element) => {
		if (hasUnsafeCss(element.textContent ?? '')) element.remove();
	});

	doc.querySelectorAll('*').forEach((element) => {
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			const value = attribute.value.trim();

			if (name.startsWith('on')) {
				element.removeAttribute(attribute.name);
				continue;
			}

			if (name === 'href' || name === 'xlink:href' || name === 'src') {
				if (!isAllowedResource(value)) element.removeAttribute(attribute.name);
				continue;
			}

			if ((name === 'style' || /url\s*\(/i.test(value)) && hasUnsafeCss(value)) {
				element.removeAttribute(attribute.name);
			}
		}
	});

	return encodeSvgDataUri(new XMLSerializer().serializeToString(doc.documentElement));
}
