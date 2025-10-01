/**
 * Type definitions for external third-party libraries.
 * 
 * This module provides TypeScript type definitions for libraries that
 * lack their own type definitions or need custom interfaces.
 * 
 * @fileoverview External library type definitions
 */

/**
 * Type definitions for the pngparse library.
 * 
 * Provides PNG file parsing functionality with callback-based API.
 * 
 * @module pngparse
 */
declare module 'pngparse' {
	/**
	 * PNG image data structure returned by pngparse.
	 * 
	 * @interface PngImage
	 */
	export interface PngImage {
		/** Image width in pixels */
		width: number;
		/** Image height in pixels */
		height: number;
		/** Number of color channels (1-4) */
		channels: number;
		/** Raw pixel data buffer */
		data: Buffer;
	}

	/**
	 * Parse a PNG file from the filesystem.
	 * 
	 * @param filename - Path to the PNG file to parse
	 * @param callback - Callback function receiving error or parsed image
	 */
	export function parseFile(filename: string, callback: (err: Error | null, image?: PngImage) => void): void;
	
	/**
	 * Parse a PNG from a buffer in memory.
	 * 
	 * @param buffer - Buffer containing PNG file data
	 * @param callback - Callback function receiving error or parsed image
	 */
	export function parse(buffer: Buffer, callback: (err: Error | null, image?: PngImage) => void): void;
}
