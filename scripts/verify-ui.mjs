import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [
	preview,
	diagramMenu,
	viewer,
	viewerModal,
	viewerView,
	drawioFileView,
	drawioFileMenu,
	deleteDiagramModal,
	editorModal,
	copyPreview,
	savePreview,
	settings,
	drawioSource,
	codeBlockSource,
	drawioFileSource,
	codeBlock,
	styles,
	editorView,
	editorTitle,
	plugin,
	xml,
] = await Promise.all([
	readFile(path.join(projectRoot, 'src', 'view', 'renderPreview.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'diagramMenu.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DrawioViewer.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DrawioViewerModal.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DrawioViewerView.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DrawioFileView.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'drawioFileMenu.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'DeleteDiagramModal.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'DrawioModal.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'copyPreview.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'view', 'SavePreviewImageModal.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'settings', 'DrawioBlocksSettingTab.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'source', 'DrawioSource.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'source', 'CodeBlockSource.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'source', 'DrawioFileSource.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'utils', 'codeBlock.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'styles.css'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'DrawioEditorView.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'editor', 'editorTitle.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'main.ts'), 'utf8'),
	readFile(path.join(projectRoot, 'src', 'utils', 'xml.ts'), 'utf8'),
]);

for (const value of [
	"text: 'View'",
	"text: 'Edit'",
	'createDiagramMenu',
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
	'container.style.setProperty',
]) {
	if (!preview.includes(value)) throw new Error(`Preview UI is missing ${value}.`);
}

for (const value of [
	'Edit in modal',
	'Edit in tab',
	'View in modal',
	'View in tab',
	'Copy image',
	'Copy XML',
	'Save image',
	'Delete diagram',
	'setWarning(true)',
	'openDeleteDiagramModal',
	'new Menu()',
]) {
	if (!diagramMenu.includes(value)) throw new Error(`Diagram context menu is missing ${value}.`);
}

const saveImageIndex = diagramMenu.indexOf("setTitle('Save image')");
const deleteDiagramIndex = diagramMenu.indexOf("setTitle('Delete diagram')");
const destructiveGroupSeparatorIndex = diagramMenu.indexOf('menu.addSeparator();', saveImageIndex);
if (
	saveImageIndex < 0 ||
	deleteDiagramIndex < 0 ||
	destructiveGroupSeparatorIndex < saveImageIndex ||
	destructiveGroupSeparatorIndex > deleteDiagramIndex
) {
	throw new Error('Delete diagram is not in its own context-menu group below Save image.');
}
if (diagramMenu.includes('Save image…') || diagramMenu.includes('Delete Diagram')) {
	throw new Error('Preview context-menu labels do not use the required sentence case.');
}

for (const value of [
	"cls: 'drawio-blocks-viewer-mode'",
	"text: 'XML'",
	"text: 'Zoom out'",
	"text: 'Zoom in'",
	"text: 'Fit'",
	"text: 'Edit'",
	"text: 'Close viewer'",
	'drawio-blocks-visually-hidden',
	"setIcon(this.closeButton, 'x')",
	'this.options.onClose?.()',
	'this.options.onEdit?.()',
	'this.options.onContextMenu',
	"DRAWIO_VIEWER_TITLE = 'draw.io Viewer'",
	'text: DRAWIO_VIEWER_TITLE',
	"addEventListener('wheel'",
	"addEventListener('pointerdown'",
	"addEventListener('contextmenu'",
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
	'this.options.xmlProvider()',
	'this.xmlCode.setText(xml)',
	"this.modeButton.setText('Canvas')",
	"this.modeButton.setText('XML')",
	"toggleAttribute('disabled', disabled)",
	'drawio-blocks-viewer-xml-pane',
	'showXml()',
	'showCanvas()',
]) {
	if (!viewer.includes(value)) throw new Error(`Diagram viewer is missing ${value}.`);
}
const modeButtonIndex = viewer.indexOf('this.modeButton =');
const zoomOutButtonIndex = viewer.indexOf('this.zoomOutButton =', modeButtonIndex);
if (modeButtonIndex < 0 || zoomOutButtonIndex < modeButtonIndex) {
	throw new Error('The viewer Canvas/XML toggle is not left of the zoom controls.');
}
const fitButtonIndex = viewer.indexOf('this.fitButton =');
const editButtonIndex = viewer.indexOf('this.editButton =');
const closeButtonIndex = viewer.indexOf('this.closeButton =', fitButtonIndex);
if (fitButtonIndex < 0 || editButtonIndex < fitButtonIndex || closeButtonIndex < editButtonIndex) {
	throw new Error('The viewer toolbar Edit button is not between Fit and Close.');
}

if (!viewerModal.includes('DrawioViewer') || !viewerModal.includes('viewer.mount()')) {
	throw new Error('The viewer modal does not mount the shared diagram viewer.');
}
for (const value of [
	'onClose: () => this.close()',
	'onEdit: () => this.startEditor()',
	'DrawioBridge',
	'this.mountEditor()',
	"this.modalEl.addClass('drawio-blocks-modal')",
	"this.contentEl.addClass('drawio-blocks-modal-content')",
	'createDiagramMenu',
	"body.addClass('drawio-blocks-viewer-modal-open')",
	"body.removeClass('drawio-blocks-viewer-modal-open')",
]) {
	if (!viewerModal.includes(value)) {
		throw new Error(`The viewer modal does not manage its body state class: ${value}.`);
	}
}
for (const value of [
	"body.addClass('drawio-blocks-editor-modal-open')",
	"body.removeClass('drawio-blocks-editor-modal-open')",
]) {
	if (!editorModal.includes(value)) {
		throw new Error(`The editor modal does not manage its body state class: ${value}.`);
	}
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
if (!viewerView.includes('openEditorInLeaf') || !viewerView.includes('onEdit:')) {
	throw new Error('The viewer tab does not replace itself with the editor.');
}
for (const [surface, source] of [
	['viewer modal', viewerModal],
	['viewer tab', viewerView],
	['.drawio file viewer', drawioFileView],
]) {
	if (!source.includes('xmlProvider: () =>') || !source.includes('.read()')) {
		throw new Error(`The ${surface} does not provide its source XML to the viewer.`);
	}
}
for (const value of [
	'DRAWIO_FILE_VIEW_TYPE',
	'extends FileView',
	'DrawioFileSource',
	'renderDiagram',
	'DrawioViewer',
	'DrawioBridge',
	'onEdit: () => this.startEditor()',
	'createDiagramMenu',
	"vault.on('modify'",
]) {
	if (!drawioFileView.includes(value)) {
		throw new Error(`The .drawio file viewer is missing ${value}.`);
	}
}
for (const value of [
	'DrawioFileSource',
	'addDiagramMenuItems',
	'renderSourceImage',
	'openRenderedViewer',
	'openEditorInTab',
	'openViewerInTab',
	'{ includeDelete: false }',
]) {
	if (!drawioFileMenu.includes(value)) {
		throw new Error(`The .drawio file context menu is missing ${value}.`);
	}
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
	"addOption('drawio', 'DRAWIO')",
	"setButtonText('Choose…')",
	"setButtonText('Cancel')",
	"setButtonText('Save')",
	'createBinary',
	'this.xmlProvider()',
	'this.app.vault.create(path',
	'A file already exists with this name.',
	'The destination folder no longer exists.',
]) {
	if (!savePreview.includes(value)) throw new Error(`Preview image saving is missing ${value}.`);
}

for (const value of [
	'ConfirmationModal',
	"setTitle('Delete diagram?')",
	"setButtonText('Delete')",
	'setDestructive()',
	'source.delete()',
	'source.deleteDescription()',
	'onDeleted?.()',
	'Deleted diagram.',
]) {
	if (!deleteDiagramModal.includes(value)) {
		throw new Error(`Diagram deletion confirmation is missing ${value}.`);
	}
}
for (const value of ['delete(): Promise<void>', 'deleteDescription(): string']) {
	if (!drawioSource.includes(value)) {
		throw new Error(`The draw.io source contract is missing ${value}.`);
	}
}
for (const value of ['async delete()', 'deleteNow()', 'removeDrawioBlock', 'vault.process']) {
	if (!codeBlockSource.includes(value)) {
		throw new Error(`Code-block source deletion is missing ${value}.`);
	}
}
for (const value of ['removeDrawioBlock', 'getDrawioBlockBody', 'lines.splice']) {
	if (!codeBlock.includes(value)) {
		throw new Error(`Safe fenced-block deletion is missing ${value}.`);
	}
}
for (const value of [
	'implements DrawioSource',
	'vault.read(this.file)',
	'vault.process(this.file',
	'fileManager.trashFile(this.file)',
	'-export.${extension}',
]) {
	if (!drawioFileSource.includes(value)) {
		throw new Error(`The .drawio file source is missing ${value}.`);
	}
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
for (const [surface, source] of [
	['preview', preview],
	['diagram menu', diagramMenu],
	['viewer', viewer],
	['viewer modal', viewerModal],
	['.drawio file viewer', drawioFileView],
	['.drawio file menu', drawioFileMenu],
	['save-image modal', savePreview],
	['settings', settings],
]) {
	for (const tooltipTrigger of [
		'setTooltip(',
		"'aria-label'",
		"'aria-labelledby'",
		"setAttribute('title'",
	]) {
		if (source.includes(tooltipTrigger)) {
			throw new Error(`${surface} still includes tooltip trigger ${tooltipTrigger}.`);
		}
	}
}
for (const tooltipCopy of [
	'preview. Select to show View and Edit',
	'Diagram viewer. Drag to pan',
]) {
	if ([preview, viewer, viewerModal].some((source) => source.includes(tooltipCopy))) {
		throw new Error(`Plugin UI still includes obsolete tooltip copy: ${tooltipCopy}.`);
	}
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
for (const value of [':has(', 'clip-path']) {
	if (styles.includes(value)) throw new Error(`Plugin styling still includes ${value}.`);
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
	'body.drawio-blocks-editor-modal-open .modal-header',
	'body.drawio-blocks-editor-modal-open .modal-header-button',
	'body.drawio-blocks-viewer-modal-open .modal-header',
	'body.drawio-blocks-viewer-modal-open .modal-header-button',
	'drawio-blocks-viewer-close',
	'drawio-blocks-viewer-mode',
	'drawio-blocks-viewer-viewport',
	'drawio-blocks-viewer-xml-pane',
	'drawio-blocks-viewer-xml-status',
	'drawio-blocks-save-image-modal',
	"[data-type='drawio-blocks-viewer']",
	"[data-type='drawio-blocks-file']",
	'drawio-blocks-drawio-file',
	'touch-action: none',
	'touch-action: pan-x pan-y',
	'overscroll-behavior: none',
	'white-space: pre',
	'user-select: text',
	'drawio-blocks-preview-card:not(.is-empty)',
	'padding-block: var(--drawio-blocks-preview-spacing)',
	'drawio-blocks-visually-hidden',
	'opacity: 0',
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
	'DRAWIO_FILE_VIEW_TYPE',
	"registerExtensions(['drawio']",
	"workspace.on('file-menu'",
	'addDrawioFileMenu',
	'renderDiagram',
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
	'Verified shared diagram actions, in-place viewer editing, .drawio files, safe-area modals, and gesture isolation\n',
);
