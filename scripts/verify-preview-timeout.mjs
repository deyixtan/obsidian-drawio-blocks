import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compilation = await esbuild.build({
	entryPoints: [path.join(projectRoot, 'src', 'preview', 'PreviewExporter.ts')],
	bundle: true,
	format: 'esm',
	platform: 'browser',
	write: false,
});
const output = compilation.outputFiles?.[0];

if (!output) throw new Error('Could not compile the preview timeout verifier.');

const scheduled = new Map();
let nextTimer = 1;
globalThis.window = {
	setTimeout(callback, delay) {
		const id = nextTimer++;
		scheduled.set(id, { callback, delay });
		return id;
	},
	clearTimeout(id) {
		scheduled.delete(id);
	},
	removeEventListener() {},
};

const { PreviewExporter } = await import(
	`data:text/javascript;base64,${Buffer.from(output.contents).toString('base64')}`
);

async function expectDeadline(local, expectedMessage) {
	const runtime = {
		isUsingLocalEditor: local,
		getEditorFrameSource: () => new Promise(() => undefined),
	};
	const exporter = new PreviewExporter(runtime);
	const result = exporter.exportSvg('<mxfile/>', false).then(
		() => {
			throw new Error('A stalled preview unexpectedly resolved.');
		},
		(error) => error,
	);
	const deadline = Array.from(scheduled.values()).find(({ delay }) => delay === 15000);

	if (!deadline) throw new Error('Preview request did not register its total deadline.');
	deadline.callback();
	const error = await result;

	if (!(error instanceof Error) || !error.message.includes(expectedMessage)) {
		throw new Error(`Unexpected stalled preview error: ${String(error)}`);
	}

	exporter.destroy();
	scheduled.clear();
}

await expectDeadline(false, 'Could not connect to diagrams.net');
await expectDeadline(true, 'Timed out rendering with the local draw.io editor');

process.stdout.write('Verified stalled online and local previews reject with visible errors\n');
