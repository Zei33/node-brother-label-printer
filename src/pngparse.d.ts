declare module 'pngparse' {
	interface PngImage {
		width: number;
		height: number;
		channels: number;
		data: Buffer;
	}

	function parseFile(filename: string, callback: (err: Error | null, image?: PngImage) => void): void;
	function parse(buffer: Buffer, callback: (err: Error | null, image?: PngImage) => void): void;
}
