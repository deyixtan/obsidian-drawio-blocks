import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await readFile(path.join(projectRoot, 'main.js'));
const drawioConfig = JSON.parse(
	await readFile(path.join(projectRoot, 'drawio.config.json'), 'utf8'),
);
const manifest = JSON.parse(await readFile(path.join(projectRoot, 'manifest.json'), 'utf8'));
const versions = JSON.parse(await readFile(path.join(projectRoot, 'versions.json'), 'utf8'));
const source = bundle.toString('utf8');

if (bundle.byteLength > 2 * 1024 * 1024) {
	throw new Error(`main.js is unexpectedly large: ${bundle.byteLength} bytes.`);
}

if (source.includes('__DRAWIO_OFFLINE_ARCHIVE')) {
	throw new Error('main.js still contains the old embedded draw.io archive.');
}

for (const requiredValue of [
	'https://embed.diagrams.net',
	drawioConfig.releaseUrl,
	drawioConfig.sha256,
	'Offline mode',
	'Switch to local editor',
	'Preview actions',
	'View button',
	'Edit button',
	'Preview border color',
	'Show preview grid',
	'View in modal',
	'View in tab',
	'Edit in modal',
	'Edit in tab',
	'Copy image',
	'Copy XML',
	'Save image',
	'Zoom in',
	'Zoom out',
	'Offline Editor',
	'Online Editor',
	'Apache License',
]) {
	if (!source.includes(requiredValue)) {
		throw new Error(`main.js is missing required runtime data: ${requiredValue}`);
	}
}

for (const removedValue of [
	'https://api.github.com/repos/jgraph/drawio/releases/latest',
	'Update to draw.io',
]) {
	if (source.includes(removedValue)) {
		throw new Error(`main.js still contains removed editor update data: ${removedValue}`);
	}
}

if (
	manifest.version !== '2.1.0' ||
	manifest.minAppVersion !== '1.13.0' ||
	versions['2.1.0'] !== '1.13.0'
) {
	throw new Error('Plugin 2.1.0 version metadata is inconsistent.');
}

new Script(source, { filename: 'main.js' });
process.stdout.write(
	`Verified selectable online/local build: ${Math.round(bundle.byteLength / 1024)} KiB main.js\n`,
);
