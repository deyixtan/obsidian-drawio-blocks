import {
	App,
	ButtonComponent,
	FuzzySuggestModal,
	Modal,
	normalizePath,
	Notice,
	Setting,
	TFolder,
	type TextComponent,
} from 'obsidian';
import { renderPreviewImage, type PreviewImageFormat } from './copyPreview';

type SaveDiagramFormat = PreviewImageFormat | 'drawio';

class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly chooseFolder: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder('Choose a destination folder…');
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllFolders(true);
	}

	getItemText(folder: TFolder): string {
		return folder.isRoot() ? 'Vault root' : folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.chooseFolder(folder);
	}
}

export class SavePreviewImageModal extends Modal {
	private folder: TFolder;
	private folderSetting: Setting | null = null;
	private folderValueEl: HTMLElement | null = null;
	private format: SaveDiagramFormat = 'png';
	private filenameInput: TextComponent | null = null;
	private filenameSetting: Setting | null = null;
	private saveButton: ButtonComponent | null = null;
	private saving = false;

	constructor(
		app: App,
		private readonly imageProvider: () => Promise<HTMLImageElement>,
		private readonly xmlProvider: () => Promise<string>,
		private readonly suggestedPath: string,
	) {
		super(app);
		this.folder = app.vault.getRoot();
	}

	onOpen(): void {
		const initial = this.initialDestination();
		this.folder = initial.folder;

		this.setTitle('Save image');
		this.modalEl.addClass('drawio-blocks-save-image-modal');
		this.contentEl.empty();

		this.filenameSetting = new Setting(this.contentEl)
			.setClass('drawio-blocks-save-image-file')
			.setName('File')
			.addText((input) => {
				this.filenameInput = input;
				input.setPlaceholder('Diagram');
				input.setValue(initial.filename);
				input.onChange(() => this.filenameSetting?.setErrorMessage(null));
				input.inputEl.addEventListener('keydown', this.onInputKeyDown);
			})
			.addDropdown((dropdown) =>
				dropdown
					.addOption('png', 'PNG')
					.addOption('jpeg', 'JPG')
					.addOption('drawio', 'DRAWIO')
					.setValue(this.format)
					.onChange((value) => {
						this.format = value === 'jpeg' || value === 'drawio' ? value : 'png';
					}),
			);

		this.folderSetting = new Setting(this.contentEl).setName('Folder');
		this.folderValueEl = this.folderSetting.controlEl.createDiv({
			cls: 'drawio-blocks-save-image-folder',
		});
		this.folderSetting.addButton((button) =>
			button.setButtonText('Choose…').onClick(() => this.openFolderPicker()),
		);

		const actions = this.contentEl.createDiv({ cls: 'drawio-blocks-save-image-actions' });
		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.close());
		this.saveButton = new ButtonComponent(actions)
			.setButtonText('Save')
			.setCta()
			.onClick(() => this.save());

		this.updateFolder();
		this.filenameInput?.inputEl.focus();
		this.filenameInput?.inputEl.select();
	}

	onClose(): void {
		this.filenameInput?.inputEl.removeEventListener('keydown', this.onInputKeyDown);
		this.folderSetting = null;
		this.folderValueEl = null;
		this.filenameInput = null;
		this.filenameSetting = null;
		this.saveButton = null;
		this.contentEl.empty();
	}

	private extension(): 'drawio' | 'jpg' | 'png' {
		if (this.format === 'drawio') return 'drawio';
		return this.format === 'png' ? 'png' : 'jpg';
	}

	private initialDestination(): { folder: TFolder; filename: string } {
		const normalized = normalizePath(this.suggestedPath);
		const separator = normalized.lastIndexOf('/');
		const folderPath = separator >= 0 ? normalized.slice(0, separator) : '';
		const rawFilename = normalized.slice(separator + 1);
		const filename = rawFilename.replace(/\.(?:drawio|jpe?g|png)$/i, '') || 'drawio-diagram';
		const folder = folderPath ? this.app.vault.getFolderByPath(folderPath) : null;

		return { folder: folder ?? this.app.vault.getRoot(), filename };
	}

	private openFolderPicker(): void {
		if (this.saving) return;

		new FolderPickerModal(this.app, (folder) => {
			this.folder = folder;
			this.folderSetting?.setErrorMessage(null);
			this.updateFolder();
		}).open();
	}

	private updateFolder(): void {
		const label = this.folder.isRoot() ? 'Vault root' : this.folder.path;
		this.folderValueEl?.setText(label);
	}

	private readonly onInputKeyDown = (event: KeyboardEvent): void => {
		if (event.key !== 'Enter' || event.isComposing) return;
		event.preventDefault();
		void this.save();
	};

	private filename(): string {
		return (this.filenameInput?.getValue() ?? '')
			.trim()
			.replace(/\.(?:drawio|jpe?g|png)$/i, '')
			.trim();
	}

	private destinationPath(): string {
		const folderPath = this.folder.isRoot() ? '' : `${this.folder.path}/`;
		return normalizePath(`${folderPath}${this.filename()}.${this.extension()}`);
	}

	private async save(): Promise<void> {
		if (
			this.saving ||
			!this.filenameInput ||
			!this.filenameSetting ||
			!this.folderSetting ||
			!this.saveButton
		) {
			return;
		}

		const filename = this.filename();
		if (!filename) {
			this.filenameSetting.setErrorMessage('Enter a file name.');
			return;
		}
		if (filename === '.' || filename === '..' || /[\\/:*?"<>|]/.test(filename)) {
			this.filenameSetting.setErrorMessage('The file name contains unsupported characters.');
			return;
		}
		if (filename.endsWith('.')) {
			this.filenameSetting.setErrorMessage('The file name cannot end with a period.');
			return;
		}

		const currentFolder = this.folder.isRoot()
			? this.app.vault.getRoot()
			: this.app.vault.getFolderByPath(this.folder.path);
		if (!currentFolder) {
			this.folderSetting.setErrorMessage('The destination folder no longer exists.');
			return;
		}

		const path = this.destinationPath();
		this.filenameInput.setValue(filename);
		if (this.app.vault.getAbstractFileByPath(path)) {
			this.filenameSetting.setErrorMessage('A file already exists with this name.');
			return;
		}

		this.saving = true;
		this.saveButton.setDisabled(true);
		this.folderSetting.setErrorMessage(null);
		this.filenameSetting.setErrorMessage(null);

		try {
			if (this.format === 'drawio') {
				await this.app.vault.create(path, await this.xmlProvider());
			} else {
				const image = await this.imageProvider();
				const blob = await renderPreviewImage(image, this.format);
				await this.app.vault.createBinary(path, await blob.arrayBuffer());
			}
			new Notice(`draw.io Blocks: Saved ${path}.`);
			this.close();
		} catch (error) {
			this.saving = false;
			this.saveButton?.setDisabled(false);
			this.filenameSetting?.setErrorMessage(
				error instanceof Error ? error.message : String(error),
			);
		}
	}
}
