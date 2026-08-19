export interface DrawioSource {
	title(): string;
	read(): Promise<string>;
	suggestedImagePath?(extension: string): string;
	write(xml: string): Promise<void>;
}
