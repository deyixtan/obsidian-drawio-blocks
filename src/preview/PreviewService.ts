import type { OfflineEditorRuntime } from '../editor/offline/OfflineEditorRuntime';
import { normalizeDrawioXml, validateDrawioXml } from '../utils/xml';
import { PreviewExporter } from './PreviewExporter';
import { sanitizeSvgDataUri } from './svg';

export interface PreviewOptions {
	dark: boolean;
}

export class PreviewService {
	private readonly exporter: PreviewExporter;

	constructor(runtime: OfflineEditorRuntime) {
		this.exporter = new PreviewExporter(runtime);
	}

	async render(xml: string, options: PreviewOptions): Promise<string> {
		const normalized = normalizeDrawioXml(xml);
		validateDrawioXml(normalized);
		const raw = await this.exporter.exportSvg(normalized, options.dark);
		return sanitizeSvgDataUri(raw);
	}

	destroy(): void {
		this.exporter.destroy();
	}
}
