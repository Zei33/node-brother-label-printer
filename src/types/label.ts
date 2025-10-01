/**
 * Label-related types and configurations for Brother QL printers.
 * 
 * This module defines all supported label types, dimensions, and calibration
 * parameters for accurate printing across different label formats.
 * 
 * @fileoverview Label type definitions and dimension specifications
 */

/**
 * Union type representing all supported Brother QL label widths and formats.
 * 
 * Includes continuous tape rolls and die-cut pre-sized labels.
 * 
 * @typedef {string} LabelWidth
 */
export type LabelWidth = 
  // Continuous labels (tape rolls)
  | "12-mm-wide continuous"
  | "17-mm-wide continuous" 
  | "23-mm-wide continuous"
  | "29-mm-wide continuous"
  | "50-mm-wide continuous"
  | "54-mm-wide continuous"
  | "62-mm-wide continuous"
  | "102-mm-wide continuous"
  // Die-cut labels (pre-cut labels with gaps)
  | "17x54-mm-die-cut"
  | "17x87-mm-die-cut"
  | "23x23-mm-die-cut"
  | "29x42-mm-die-cut"
  | "29x90-mm-die-cut"
  | "38x90-mm-die-cut"
  | "39x48-mm-die-cut"
  | "52x29-mm-die-cut"
  | "54x29-mm-die-cut"
  | "60x86-mm-die-cut"
  | "62x29-mm-die-cut"
  | "62x100-mm-die-cut"
  | "102x51-mm-die-cut"
  | "102x152-mm-die-cut";

/**
 * Physical dimensions for die-cut labels in millimeters.
 * 
 * @interface DieCutDimensions
 */
export interface DieCutDimensions {
	/** Label width in millimeters */
	widthMm: number;
	/** Label length in millimeters */
	lengthMm: number;
}

/**
 * Standard die-cut label dimensions based on Brother's official specifications.
 * 
 * Maps label type strings to their physical dimensions in millimeters.
 * Used for proper image scaling and positioning during print processing.
 * 
 * @constant {Record<string, DieCutDimensions>} DieCutLabelDimensions
 */
export const DieCutLabelDimensions: Record<string, DieCutDimensions> = {
	// Small labels
	"17x54-mm-die-cut": { widthMm: 17, lengthMm: 54 },
	"17x87-mm-die-cut": { widthMm: 17, lengthMm: 87 },
	"23x23-mm-die-cut": { widthMm: 23, lengthMm: 23 },
	// Medium labels
	"29x42-mm-die-cut": { widthMm: 29, lengthMm: 42 },
	"29x90-mm-die-cut": { widthMm: 29, lengthMm: 90 },
	"38x90-mm-die-cut": { widthMm: 38, lengthMm: 90 },
	"39x48-mm-die-cut": { widthMm: 39, lengthMm: 48 },
	"52x29-mm-die-cut": { widthMm: 52, lengthMm: 29 },
	"54x29-mm-die-cut": { widthMm: 54, lengthMm: 29 },
	"60x86-mm-die-cut": { widthMm: 60, lengthMm: 86 },
	"62x29-mm-die-cut": { widthMm: 62, lengthMm: 29 },
	"62x100-mm-die-cut": { widthMm: 62, lengthMm: 100 },
	// Large labels
	"102x51-mm-die-cut": { widthMm: 102, lengthMm: 51 },
	"102x152-mm-die-cut": { widthMm: 102, lengthMm: 152 }
};

/**
 * Calibration parameters for fine-tuning label positioning and cutting.
 * 
 * These adjustments compensate for printer-specific variations in
 * positioning and cutting accuracy.
 * 
 * @interface LabelCalibration
 */
export interface LabelCalibration {
	/** Horizontal positioning adjustment in pixels (positive shifts right, negative shifts left) */
	leftOffsetAdjustment: number;
	/** Vertical positioning adjustment in pixels (positive shifts down, negative shifts up) */
	topOffsetAdjustment: number;
	/** Cut length adjustment in millimeters (negative reduces cut length) */
	lengthAdjustmentMm: number;
}

/**
 * Parameters for pixel bounds checking during image processing.
 * 
 * @interface PixelBounds
 */
export interface PixelBounds {
	/** Scaled image data matrix */
	scaledData: number[][];
	/** Source X coordinate */
	srcX: number;
	/** Source Y coordinate */
	srcY: number;
	/** Scaled image width in pixels */
	scaledWidth: number;
	/** Scaled image height in pixels */
	scaledHeight: number;
}

/**
 * Parameters for centering images within target dimensions.
 * 
 * @interface CenteringParams
 */
export interface CenteringParams {
	/** Scaled image data matrix */
	scaledData: number[][];
	/** Scaled image width in pixels */
	scaledWidth: number;
	/** Scaled image height in pixels */
	scaledHeight: number;
	/** Target width in pixels */
	targetWidthPixels: number;
	/** Target length in pixels */
	targetLengthPixels: number;
	/** Horizontal offset for centering */
	offsetX: number;
	/** Vertical offset for centering */
	offsetY: number;
}

/**
 * Parameters for applying calibration adjustments during image processing.
 * 
 * @interface ImageCalibrationParams
 */
export interface ImageCalibrationParams {
	/** Scaled image data matrix */
	scaledData: number[][];
	/** Scaled image width in pixels */
	scaledWidth: number;
	/** Scaled image height in pixels */
	scaledHeight: number;
	/** Target width in pixels */
	targetWidthPixels: number;
	/** Target length in pixels */
	targetLengthPixels: number;
	/** Optional calibration parameters to apply */
	calibration: LabelCalibration | undefined;
}
