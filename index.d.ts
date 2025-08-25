// TypeScript type definitions for node-brother-label-printer
// Project: https://github.com/yiqun12/node-brother-label-printer
// Definitions by: AI Assistant

/**
 * Supported label width types
 */
export type LabelWidth = "62-mm-wide continuous" | "102-mm-wide continuous";

/**
 * PNG image object structure (from pngparse)
 */
export interface PngImage {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Number of color channels (1-4) */
  channels: number;
  /** Raw image data buffer */
  data: Buffer;
}

/**
 * Print and conversion options
 */
export interface PrintOptions {
  /** Whether to rotate the image 90 degrees (default: false) */
  landscape?: boolean;
  /** Label width specification */
  labelWidth: LabelWidth;
  /** Threshold for black/white conversion (0-255, default: 128) */
  blackwhiteThreshold?: number;
}

/**
 * Compression settings
 */
export interface CompressionOptions {
  /** Whether to enable compression (default: false) */
  enable: boolean;
}

/**
 * Parameters for printPngFile function
 */
export interface PrintPngFileParams {
  /** USB Vendor ID (e.g., 0x04f9 for Brother) */
  vendorId: number;
  /** USB Product ID (e.g., 0x209D) */
  productId: number;
  /** Path to PNG file to print */
  filename: string;
  /** Print options */
  options: PrintOptions;
  /** Compression options */
  compression: CompressionOptions;
}

/**
 * Print a PNG file to a Brother label printer via USB
 * 
 * @param params - Print parameters including vendor/product IDs, filename, and options
 * @returns Promise that resolves when printing is initiated
 * 
 * @example
 * ```typescript
 * import { printPngFile } from 'node-brother-label-printer';
 * 
 * await printPngFile({
 *   vendorId: 0x04f9,
 *   productId: 0x209D,
 *   filename: './label.png',
 *   options: { 
 *     landscape: false, 
 *     labelWidth: '62-mm-wide continuous' 
 *   },
 *   compression: { enable: true }
 * });
 * ```
 */
export function printPngFile(params: PrintPngFileParams): Promise<void>;

/**
 * Convert a PNG image to Brother label printer format
 * 
 * @param img - PNG image object (from pngparse or similar)
 * @param options - Conversion options
 * @param compression - Compression settings
 * @returns Promise that resolves to printer-compatible buffer
 * 
 * @example
 * ```typescript
 * import { convert } from 'node-brother-label-printer';
 * import { parseFile } from 'pngparse';
 * import { promisify } from 'util';
 * 
 * const parseFileAsync = promisify(parseFile);
 * const image = await parseFileAsync('label.png');
 * 
 * const printData = await convert(image, {
 *   landscape: false,
 *   labelWidth: '62-mm-wide continuous',
 *   blackwhiteThreshold: 128
 * }, {
 *   enable: true
 * });
 * ```
 */
export function convert(
  img: PngImage,
  options: PrintOptions,
  compression: CompressionOptions
): Promise<Buffer>;
