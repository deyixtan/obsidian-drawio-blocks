import { EMPTY_DRAWIO_XML } from '../constants';

export function normalizeDrawioXml(xml: string): string {
	const trimmed = xml.trim();
	if (!trimmed) return EMPTY_DRAWIO_XML;
	return trimmed;
}

export function isDrawioDiagramEmpty(xml: string): boolean {
	if (!xml.trim()) return true;

	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	if (doc.querySelector('parsererror')) return false;
	if (doc.getElementsByTagName('mxGraphModel').length === 0) return false;

	return !Array.from(doc.getElementsByTagName('mxCell')).some(
		(cell) => cell.getAttribute('vertex') === '1' || cell.getAttribute('edge') === '1',
	);
}

export function validateDrawioXml(xml: string): void {
	const normalized = normalizeDrawioXml(xml);
	const doc = new DOMParser().parseFromString(normalized, 'application/xml');
	if (doc.querySelector('parsererror')) {
		throw new Error('The diagram XML is not well formed.');
	}

	const root = doc.documentElement.localName;
	if (root !== 'mxfile' && root !== 'mxGraphModel') {
		throw new Error(`Unsupported draw.io XML root: <${root}>.`);
	}
}

export function formatDrawioXml(xml: string): string {
	const normalized = normalizeDrawioXml(xml).replace(/>\s+</g, '><');
	const tokens = normalized.replace(/></g, '>\n<').split('\n');
	let depth = 0;
	const output: string[] = [];

	for (const raw of tokens) {
		const token = raw.trim();
		if (!token) continue;

		const closes = /^<\//.test(token);
		const declaration = /^<\?/.test(token) || /^<!/.test(token);
		const selfClosing = /\/>$/.test(token);
		const pairedOnOneLine = /^<[^!?/][^>]*>.*<\/[^>]+>$/.test(token);

		if (closes) depth = Math.max(0, depth - 1);
		output.push(`${'  '.repeat(depth)}${token}`);
		if (!closes && !declaration && !selfClosing && !pairedOnOneLine) depth += 1;
	}

	return output.join('\n');
}
