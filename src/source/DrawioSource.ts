export interface DrawioSource {
	delete(): Promise<void>;
	deleteDescription(): string;
	title(): string;
	read(): Promise<string>;
	suggestedImagePath?(extension: string): string;
	write(xml: string): Promise<void>;
}
