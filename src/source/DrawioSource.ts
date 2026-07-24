export interface DrawioSource {
	title(): string;
	read(): Promise<string>;
	write(xml: string): Promise<void>;
}
