/**
 * Consolidated type exports for the Brother label printer library.
 * 
 * This module serves as the main entry point for all type definitions,
 * providing a single import location for consumers of the library.
 * 
 * @fileoverview Main type export module
 */

// Core image processing and print operation types
export type {
	PngImage,
	BlackWhiteMatrixImage,
	PrintOptions,
	CompressionOptions,
	PrintPngFileParams,
	AutoPrintPngFileParams
} from './core.js';

// Printer hardware and capability types
export type {
	PrinterModel,
	PrinterProductId,
	LabelConfiguration,
	PrinterCapabilities,
	DetectedPrinter,
	PrinterStatus,
	InterfaceResult,
	RowBufferOptions,
	RowProcessingOptions
} from './printer.js';

// Printer status utility functions
export { PrinterStatusUtils } from './printer.js';

// Label specification and calibration types
export type {
	LabelWidth,
	DieCutDimensions,
	LabelCalibration,
	PixelBounds,
	CenteringParams,
	ImageCalibrationParams
} from './label.js';

// Label dimension constants
export { DieCutLabelDimensions } from './label.js';

// Configuration file structure types
export type {
	LabelConfig,
	PrinterConfig
} from './config.js';
