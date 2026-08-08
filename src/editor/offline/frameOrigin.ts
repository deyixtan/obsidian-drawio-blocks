export interface EditorFramePolicy {
	readonly targetOrigin: string;
	accepts(event: MessageEvent, iframe: HTMLIFrameElement | null, handshake: boolean): boolean;
}

function getExpectedOrigins(editorUrl: string): ReadonlySet<string> {
	const origins = new Set<string>();

	try {
		const url = new URL(editorUrl);

		if (url.origin !== 'null') {
			origins.add(url.origin);
		} else {
			origins.add('null');
			if (url.protocol && url.host) origins.add(`${url.protocol}//${url.host}`);
		}
	} catch {
		// The iframe load will surface an invalid runtime URL.
	}

	return origins;
}

export function createEditorFramePolicy(editorUrl: string, local: boolean): EditorFramePolicy {
	const expectedOrigins = getExpectedOrigins(editorUrl);
	let boundLocalOrigin: string | undefined;

	return {
		targetOrigin: local ? '*' : new URL(editorUrl).origin,
		accepts(event, iframe, handshake) {
			if (event.source !== iframe?.contentWindow) return false;

			if (!local) return expectedOrigins.has(event.origin);
			if (boundLocalOrigin !== undefined) return event.origin === boundLocalOrigin;

			// Obsidian resource URLs use per-session custom scheme hosts. Depending on the
			// platform, postMessage reports that host, app://obsidian.md, or an opaque
			// `null` origin. Bind the first valid draw.io handshake and require it thereafter.
			if (!handshake && !expectedOrigins.has(event.origin)) return false;
			boundLocalOrigin = event.origin;
			return true;
		},
	};
}
