import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [
	preview,
	viewer,
	viewerModal,
	viewerView,
	editorModal,
	copyPreview,
	savePreview,
	settings,
	styles,
	editorView,
	editorTitle,
	plugin,
	xml,
] = await Promise.all([
	readFile(path.join(projectRoot, 'src', 'view', 'renderPreview.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DrawioViewer.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DrawioViewerModal.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DrawioViewerView.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'DrawioModal.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'copyPreview.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'SavePreviewImageModal.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'settings', 'DrawioBlocksSettingTab.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'styles.css'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'DrawioEditorView.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'editorTitle.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'main.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'utils', 'xml.ts'), 'utf8'),
]);

for (const value of [
	'Edit in modal',
	'Edit in tab',
	'View in modal',
	'View in tab',
	'Copy image',
	'Copy XML',
	'Save image…',
	"text: 'View'",
	"text: 'Edit'",
	'new Menu()',
	'showAtMouseEvent',
	'showAtPosition',
	"addEventListener('contextmenu'",
	"addEventListener('pointerdown'",
	"addEventListener('pointermove'",
	'suppressContextMenuUntil',
	'postLongPressSuppression',
	"event.key === 'F10'",
	"event.key !== 'ContextMenu'",
	'viewButton.disabled',
	"plugin.defaultViewDestination === 'tab'",
	"plugin.defaultEditDestination === 'tab'",
	'openEditorInTab',
	'updateAppearance',
	'--drawio-blocks-preview-border-color',
	'has-grid',
	'is-unavailable',
	'has-error',
	"tabindex: '0'",
	'imageWrap.focus',
	'isDrawioDiagramEmpty',
	"container.toggleClass('is-empty'",
	'getComputedStyle',
	'lineHeight',
	"'aria-labelledby': accessibleLabelId",
	'drawio-blocks-visually-hidden',
	'container.style.setProperty',
]) {
	if (!preview.includes(value)) throw new Error(`Preview UI is missing ${value}.`);
}

for (const value of [
	"'Zoom out'",
	"'Zoom in'",
	"text: 'Fit'",
	"'aria-label': 'Close viewer'",
	"setIcon(this.closeButton, 'x')",
	'this.requestClose?.()',
	"DRAWIO_VIEWER_TITLE = 'draw.io Viewer'",
	'text: DRAWIO_VIEWER_TITLE',
	"addEventListener('wheel'",
	"addEventListener('pointerdown'",
	'setPointerCapture',
	'cancelScheduledFit',
	'hasUserTransform',
	"addEventListener('touchstart'",
	'event.stopPropagation()',
	'this.pointers',
	'gestureStartDistance',
	'constrainScale',
	'zoomAt',
	'fit()',
	'translate3d',
]) {
	if (!viewer.includes(value)) throw new Error(`Diagram viewer is missing ${value}.`);
}

if (!viewerModal.includes('DrawioViewer') || !viewerModal.includes('viewer.mount()')) {
	throw new Error('The viewer modal does not mount the shared diagram viewer.');
}
if (!viewerModal.includes('() =>') || !viewerModal.includes('this.close()')) {
	throw new Error('The viewer toolbar close button does not close its modal.');
}
if (!viewerView.includes('DRAWIO_VIEWER_VIEW_TYPE') || !viewerView.includes('DrawioViewer')) {
	throw new Error('The viewer tab does not mount the shared diagram viewer.');
}
if (!viewerView.includes('return DRAWIO_VIEWER_TITLE')) {
	throw new Error('The viewer tab does not use the consistent draw.io Viewer title.');
}
if (!viewerView.includes('this.leaf.detach()')) {
	throw new Error('The viewer toolbar close button does not close its tab.');
}
for (const value of [
	'ClipboardItem',
	"'image/png'",
	"'image/jpeg'",
	'canvas.toBlob',
	'clipboard.writeText',
]) {
	if (!copyPreview.includes(value)) throw new Error(`Preview copying is missing ${value}.`);
}
for (const value of [
	"setTitle('Save image')",
	'FuzzySuggestModal',
	'getAllFolders(true)',
	"setName('Folder')",
	"setName('File')",
	'drawio-blocks-save-image-file',
	'addDropdown',
	"addOption('png', 'PNG')",
	"addOption('jpeg', 'JPG')",
	"setButtonText('Choose…')",
	"setButtonText('Cancel')",
	"setButtonText('Save')",
	'createBinary',
	'A file already exists with this name.',
	'The destination folder no longer exists.',
]) {
	if (!savePreview.includes(value)) throw new Error(`Preview image saving is missing ${value}.`);
}

if (styles.includes('Click to edit') || styles.includes('Tap to edit')) {
	throw new Error('The obsolete single-action preview overlay is still present.');
}
if (preview.includes('drawio-blocks-preview-action mod-cta')) {
	throw new Error('The two preview actions do not use the same button style.');
}
if (preview.includes("text: 'More'")) {
	throw new Error('The preview still includes the obsolete More button.');
}
if (preview.includes("'aria-label': `${source.title()} preview")) {
	throw new Error('The SVG preview still exposes a delayed hover tooltip.');
}
if (preview.includes('drawio-blocks-embed-host') || styles.includes('drawio-blocks-embed-host')) {
	throw new Error('The native Markdown hover border is still suppressed.');
}
if (styles.includes('!important')) {
	throw new Error('Plugin styling must not rely on !important overrides.');
}
if (styles.includes('@media (hover: none), (pointer: coarse)')) {
	throw new Error('Touch devices still force the preview actions to remain visible.');
}
for (const value of [
	'drawio-blocks-preview-actions',
	'is-unavailable',
	'drawio-blocks-offline-spinner',
	'drawio-blocks-image-wrap.has-grid',
	'border: 1px solid var(--drawio-blocks-preview-border-color',
	'is-empty.has-preview',
	'--drawio-blocks-empty-preview-height',
	'--drawio-blocks-empty-preview-height: 1.5em',
	'--drawio-blocks-empty-actions-height',
	'min-height: var(--drawio-blocks-empty-actions-height)',
	'margin-block: 0',
	'width: auto',
	'height: auto',
	'object-fit: contain',
	"[data-type='drawio-blocks-editor']",
	'drawio-blocks-viewer-modal',
	'body:has(.drawio-blocks-modal) .modal-header',
	'body:has(.drawio-blocks-modal) .modal-header-button',
	'body:has(.drawio-blocks-viewer-modal) .modal-header',
	'body:has(.drawio-blocks-viewer-modal) .modal-header-button',
	'drawio-blocks-viewer-close',
	'drawio-blocks-viewer-viewport',
	'drawio-blocks-save-image-modal',
	"[data-type='drawio-blocks-viewer']",
	'touch-action: none',
	'overscroll-behavior: none',
	'drawio-blocks-preview-card:not(.is-empty)',
	'padding-block: var(--drawio-blocks-preview-spacing)',
	'drawio-blocks-visually-hidden',
	'grid-template-columns: minmax(0, 1fr) auto',
	'var(--safe-area-inset-top,',
	'env(safe-area-inset-top, 0px)',
	'width: calc(',
	'100vw - var(--drawio-blocks-safe-area-left)',
	'100dvh - var(--drawio-blocks-safe-area-top)',
	'transform: none',
	'transform-origin: 0 0',
]) {
	if (!styles.includes(value)) throw new Error(`Plugin styling is missing ${value}.`);
}
for (const source of [viewerModal, editorModal]) {
	for (const value of ['modalClose', "querySelector<HTMLElement>('.modal-header')"]) {
		if (source.includes(value)) {
			throw new Error(
				`Modal code still includes obsolete close-button suppression: ${value}.`,
			);
		}
	}
}
if (styles.includes('.modal-close-button')) {
	throw new Error('Plugin styling still targets the obsolete native modal close button.');
}
for (const value of ['isDrawioDiagramEmpty', "getAttribute('vertex')", "getAttribute('edge')"]) {
	if (!xml.includes(value)) throw new Error(`Empty-diagram detection is missing ${value}.`);
}
for (const value of [
	'getSettingDefinitions',
	"heading: 'Offline mode'",
	"heading: 'Preview actions'",
	"heading: 'Diagram appearance and storage'",
	"heading: 'Advanced'",
	"name: 'Switch to local editor'",
	'desc: `Version: ${displayedVersion}`',
	"name: 'View button'",
	"name: 'Edit button'",
	"key: 'defaultViewDestination'",
	"key: 'defaultEditDestination'",
	"type: 'dropdown'",
	"modal: 'Open in modal'",
	"tab: 'Open in tab'",
	"name: 'Preview border color'",
	"name: 'Show preview grid'",
	"name: 'Reset editor preferences'",
	"name: 'Reset plugin settings'",
	"setButtonText('Reset')",
	'setDestructive()',
	'resetEditorPreferences',
	'resetPluginSettings',
	'drawio-blocks-offline-progress',
]) {
	if (!settings.includes(value)) throw new Error(`Searchable settings UI is missing ${value}.`);
}
for (const value of ["setButtonText('Update')", 'updateLocalEditor']) {
	if (settings.includes(value))
		throw new Error(`Settings still include editor updates: ${value}.`);
}
if (!editorView.includes('DRAWIO_EDITOR_VIEW_TYPE') || !editorView.includes('DrawioBridge')) {
	throw new Error('The editor tab does not host the draw.io bridge.');
}
for (const value of ['Offline Editor', 'Online Editor']) {
	if (!editorTitle.includes(value)) throw new Error(`Editor titles are missing ${value}.`);
}
for (const value of [
	'localEditorInstallPhase',
	'setOfflineModeEnabled',
	'defaultViewDestination',
	'defaultEditDestination',
	'defaultViewDestination: this.defaultViewDestination',
	'defaultEditDestination: this.defaultEditDestination',
	'refreshPreviewAppearance',
	'refreshSettings',
	'openViewerInTab',
	'viewerSessions',
	'DRAWIO_VIEWER_VIEW_TYPE',
	'resetEditorPreferences',
	'resetPluginSettings',
]) {
	if (!plugin.includes(value)) throw new Error(`Background settings state is missing ${value}.`);
}
for (const value of ['localEditorUpdateAvailable', 'compareDrawioVersions']) {
	if (plugin.includes(value)) throw new Error(`Plugin still includes editor updates: ${value}.`);
}
for (const value of [
	'insert-drawio-code-block',
	'refresh-drawio-previews',
	'reset-drawio-editor-settings',
	'this.addCommand',
]) {
	if (plugin.includes(value))
		throw new Error(`Plugin still includes obsolete command: ${value}.`);
}
for (const value of ['height: 100dvh', 'width: 100vw']) {
	if (styles.includes(value)) throw new Error(`Mobile modal styling still includes ${value}.`);
}

process.stdout.write(
	'Verified preview actions, gesture-isolated pinch viewer, safe-area modals, settings, and error overlays\n',
);
