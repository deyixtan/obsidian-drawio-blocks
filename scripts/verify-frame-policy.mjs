import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compilation = await esbuild.build({
	entryPoints: [path.join(projectRoot, 'src', 'editor', 'offline', 'frameOrigin.ts')],
	bundle: true,
	format: 'esm',
	platform: 'browser',
	write: false,
});
const output = compilation.outputFiles?.[0];

if (!output) throw new Error('Could not compile the editor frame policy verifier.');

const { createEditorFramePolicy } = await import(
	`data:text/javascript;base64,${Buffer.from(output.contents).toString('base64')}`
);
const frameWindow = {};
const otherWindow = {};
const iframe = { contentWindow: frameWindow };
const event = (origin, source = frameWindow) => ({ origin, source });

const online = createEditorFramePolicy('https://embed.diagrams.net/?embed=1', false);
if (online.targetOrigin !== 'https://embed.diagrams.net') {
	throw new Error(`Online target origin is invalid: ${online.targetOrigin}`);
}
if (!online.accepts(event('https://embed.diagrams.net'), iframe, true)) {
	throw new Error('Online frame policy rejected the diagrams.net origin.');
}
if (online.accepts(event('null'), iframe, true)) {
	throw new Error('Online frame policy accepted an opaque origin.');
}
if (online.accepts(event('https://embed.diagrams.net', otherWindow), iframe, true)) {
	throw new Error('Online frame policy accepted a message from another window.');
}

const local = createEditorFramePolicy('app://vault/plugin/drawio/index.html', true);
if (local.targetOrigin !== '*') {
	throw new Error(`Local target origin is invalid: ${local.targetOrigin}`);
}
if (local.accepts(event('app://obsidian.md'), iframe, false)) {
	throw new Error('Local frame policy bound an unexpected origin without a handshake.');
}
if (!local.accepts(event('app://obsidian.md'), iframe, true)) {
	throw new Error('Local frame policy rejected a valid handshake from Obsidian.');
}
if (!local.accepts(event('app://obsidian.md'), iframe, false)) {
	throw new Error('Local frame policy rejected its pinned origin.');
}
if (local.accepts(event('app://vault'), iframe, true)) {
	throw new Error('Local frame policy changed origin after the handshake.');
}

const srcdoc = createEditorFramePolicy('about:srcdoc', true);
if (!srcdoc.accepts(event('app://obsidian.md'), iframe, true)) {
	throw new Error('Local srcdoc policy rejected the parent Obsidian origin.');
}
if (srcdoc.accepts(event('null'), iframe, false)) {
	throw new Error('Local srcdoc policy accepted an origin change.');
}

process.stdout.write('Verified strict online origin and pinned local iframe handshake\n');
