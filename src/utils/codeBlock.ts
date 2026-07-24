export interface DrawioBlockRange {
	start: number;
	end: number;
}

const OPEN_RE = /^\s*(`{3,}|~{3,})\s*drawio\s*$/i;
const CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;

export function getDrawioBlockBody(
	lines: string[],
	range: DrawioBlockRange,
): string | null {
	if (range.start < 0 || range.end <= range.start || range.end >= lines.length) {
		return null;
	}

	const open = OPEN_RE.exec(lines[range.start] ?? '');
	const close = CLOSE_RE.exec(lines[range.end] ?? '');
	if (!open || !close) return null;

	const openFence = open[1] ?? '```';
	const closeFence = close[1] ?? '```';
	if (openFence[0] !== closeFence[0] || closeFence.length < openFence.length) {
		return null;
	}

	return lines.slice(range.start + 1, range.end).join('\n').trim();
}

export function findDrawioBlocks(
	lines: string[],
	expectedBody: string,
): DrawioBlockRange[] {
	const wanted = expectedBody.trim();
	const matches: DrawioBlockRange[] = [];

	for (let start = 0; start < lines.length; start += 1) {
		const open = OPEN_RE.exec(lines[start] ?? '');
		if (!open) continue;
		const openFence = open[1] ?? '```';

		for (let end = start + 1; end < lines.length; end += 1) {
			const close = CLOSE_RE.exec(lines[end] ?? '');
			if (!close) continue;
			const closeFence = close[1] ?? '```';
			if (closeFence[0] !== openFence[0] || closeFence.length < openFence.length) {
				continue;
			}

			const range = { start, end };
			if (getDrawioBlockBody(lines, range) === wanted) matches.push(range);
			start = end;
			break;
		}
	}

	return matches;
}

export function replaceDrawioBlockBody(
	documentText: string,
	range: DrawioBlockRange,
	body: string,
): string {
	const newline = documentText.includes('\r\n') ? '\r\n' : '\n';
	const lines = documentText.split(/\r?\n/);
	const replacement = body.split('\n');
	lines.splice(
		range.start + 1,
		Math.max(0, range.end - range.start - 1),
		...replacement,
	);
	return lines.join(newline);
}
