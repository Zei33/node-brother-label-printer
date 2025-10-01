/**
 * Core types for the Brother label printer library.
 * 
 * Defines fundamental data structures and interfaces used throughout the library
 * for image processing, print configuration, and function parameters.
 * 
 * @fileoverview Core type definitions for Brother QL label printers
 */

import type { LabelWidth } from './label.js';
import type { PrinterProductId } from './printer.js';

/**
 * PNG image object structure as returned by the pngparse library.
 * 
 * @interface PngImage
 */
export interface PngImage {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Number of color channels (1=grayscale, 2=grayscale+alpha, 3=RGB, 4=RGBA) */
  channels: number;
  /** Raw image data buffer containing pixel values */
  data: Buffer;
}

/**
 * Internal representation of an image as a black and white matrix.
 * Used during image processing before conversion to printer format.
 * 
 * @interface BlackWhiteMatrixImage
 */
export interface BlackWhiteMatrixImage {
  /** Image height in pixels */
  height: number;
  /** Image width in pixels */
  width: number;
  /** Matrix data where 0 represents white pixels and 1 represents black pixels */
  data: number[][];
}

/**
 * Configuration options for printing and image conversion.
 * 
 * @interface PrintOptions
 */
export interface PrintOptions {
  /** Whether to rotate the image 90 degrees clockwise before printing */
  landscape?: boolean;
  /** Label width specification that determines print area and margins */
  labelWidth: LabelWidth;
  /** Threshold value for black/white conversion (0-255, values below threshold become black) */
  blackwhiteThreshold?: number;
}

/**
 * Compression settings for printer communication.
 * 
 * @interface CompressionOptions
 */
export interface CompressionOptions {
  /** Whether to enable TIFF PackBits compression (only works with compatible printers) */
  enable: boolean;
}

/**
 * Parameters for the legacy printPngFile function.
 * Maintains backward compatibility with direct USB ID specification.
 * 
 * @interface PrintPngFileParams
 */
export interface PrintPngFileParams {
  /** USB Vendor ID (0x04F9 for Brother devices) */
  vendorId: number;
  /** USB Product ID specific to the printer model */
  productId: number;
  /** Absolute or relative path to the PNG file to print */
  filename: string;
  /** Print configuration options */
  options: PrintOptions;
  /** Compression configuration options */
  compression: CompressionOptions;
}

/**
 * Parameters for the auto-detecting printPngFile function.
 * Automatically detects connected printers and optimal settings.
 * 
 * @interface AutoPrintPngFileParams
 */
export interface AutoPrintPngFileParams {
  /** Absolute or relative path to the PNG file to print */
  filename: string;
  /** Print configuration options */
  options: PrintOptions;
  /** Optional printer product ID to force selection when multiple printers are detected */
  forceProductId?: PrinterProductId;
}
