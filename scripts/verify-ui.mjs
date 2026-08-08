import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [preview, settings, styles, editorView, editorTitle, plugin] = await Promise.all([
	readFile(path.join(projectRoot, 'src', 'view', 'renderPreview.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'settings', 'DrawioBlocksSettingTab.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'styles.css'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'DrawioEditorView.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'editorTitle.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'main.ts'), 'utf8'),
]);

for (const value of [
	'Open in modal',
	'Open in tab',
	'openEditorInTab',
	'updateAppearance',
	'--drawio-blocks-preview-border-color',
	'has-grid',
	'is-unavailable',
	'has-error',
]) {
	if (!preview.includes(value)) throw new Error(`Preview UI is missing ${value}.`);
}

if (styles.includes('Click to edit') || styles.includes('Tap to edit')) {
	throw new Error('The obsolete single-action preview overlay is still present.');
}
if (preview.includes('drawio-blocks-preview-action mod-cta')) {
	throw new Error('The two preview actions do not use the same button style.');
}
for (const value of [
	'drawio-blocks-preview-actions',
	'is-unavailable',
	'drawio-blocks-offline-spinner',
	'drawio-blocks-preview-image.has-grid',
	'border: 1px solid var(--drawio-blocks-preview-border-color',
]) {
	if (!styles.includes(value)) throw new Error(`Plugin styling is missing ${value}.`);
}
for (const value of [
	'getSettingDefinitions',
	"heading: 'Offline mode'",
	"heading: 'Diagram appearance and storage'",
	"name: 'Local editor'",
	'desc: `Version: ${displayedVersion}`',
	"setButtonText('Update')",
	"name: 'Preview border color'",
	"name: 'Show preview grid'",
	'drawio-blocks-offline-progress',
]) {
	if (!settings.includes(value)) throw new Error(`Searchable settings UI is missing ${value}.`);
}
if (!editorView.includes('DRAWIO_EDITOR_VIEW_TYPE') || !editorView.includes('DrawioBridge')) {
	throw new Error('The editor tab does not host the draw.io bridge.');
}
for (const value of ['Offline Editor', 'Online Editor']) {
	if (!editorTitle.includes(value)) throw new Error(`Editor titles are missing ${value}.`);
}
for (const value of [
	'localEditorInstallPhase',
	'localEditorUpdateAvailable',
	'setOfflineModeEnabled',
	'refreshPreviewAppearance',
	'refreshSettings',
]) {
	if (!plugin.includes(value)) throw new Error(`Background settings state is missing ${value}.`);
}

process.stdout.write(
	'Verified preview appearance controls, offline toggle state, editor titles, and error overlay\n',
);
