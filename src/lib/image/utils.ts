/**
 * Image processing utility functions for Brother QL printers.
 * 
 * Provides core image manipulation utilities including format conversion,
 * scaling, rotation, and die-cut label processing with calibration support
 * for accurate positioning and cutting.
 * 
 * @fileoverview Image processing utility functions and transformations
 */

import type { PngImage, PrintOptions, BlackWhiteMatrixImage, LabelWidth } from '../../types/index.js';
import { DieCutLabelDimensions } from '../../types/index.js';
import { LABEL_CALIBRATIONS, type LabelCalibration } from '../calibration/labelCalibration.js';
import { logger } from '../utils/logger.js';

/**
 * Calculate grayscale value from pixel data based on channel configuration.
 * 
 * Supports 1-4 channel images (grayscale, grayscale+alpha, RGB, RGBA)
 * using standard luminance coefficients for color to grayscale conversion.
 * 
 * @param imageData - Raw pixel data array
 * @param pos - Starting position of pixel in the data array
 * @param channels - Number of channels per pixel (1-4)
 * @returns Grayscale value (0-255)
 * @throws {Error} When channel count is not supported
 */
export function getPixelGrayscaleValue(imageData: Uint8Array, pos: number, channels: number): number {
	// 1 channel : grayscale
	// 2 channels: grayscale + alpha
	// 3 channels: RGB
	// 4 channels: RGBA
	switch (channels) {
		case 1:
			return imageData[pos];

		case 2:
			return (imageData[pos] * imageData[pos + 1]) / 255;

		case 3:
			return 0.21 * imageData[pos] + 0.72 * imageData[pos + 1] + 0.07 * imageData[pos + 2];

		case 4:
			return ((0.21 * imageData[pos] + 0.72 * imageData[pos + 1] + 0.07 * imageData[pos + 2]) * imageData[pos + 3]) / 255;

		default:
			throw new Error(`Unsupported number of channels: ${channels}`);
	}
}

/**
 * Convert PNG image to black and white matrix representation.
 * 
 * Transforms the PNG image data into a 2D matrix where each pixel is
 * represented as 0 (white) or 1 (black) based on the threshold value.
 * 
 * @param image - Source PNG image data
 * @param options - Print options containing the black/white threshold
 * @returns Black and white matrix image suitable for printer processing
 */
export function convertToBlackAndWhiteMatrixImage(image: PngImage, options: PrintOptions): BlackWhiteMatrixImage {
	// convert image to matrix of pixels:
	const rows: number[][] = [];
	const threshold = options.blackwhiteThreshold ?? 128;

	for (let y = 0; y < image.height; y++) {
		const cols: number[] = [];
		for (let x = 0; x < image.width; x++) {
			const pos = (x + image.width * y) * image.channels;
			const grayValue = getPixelGrayscaleValue(image.data, pos, image.channels);
			const pixel = grayValue < threshold ? 1 : 0; // white = 0, black = 1
			cols.push(pixel);
		}
		rows.push(cols);
	}

	return {
		height: image.height,
		width: image.width,
		data: rows
	};
}

/**
 * Rotate matrix image 90 degrees clockwise.
 * 
 * Transforms the image matrix for landscape printing by rotating
 * the pixel data and swapping width/height dimensions.
 * 
 * @param bwMatrixImage - Source black and white matrix image
 * @returns Rotated matrix image with swapped dimensions
 */
export function rotateMatrixImage(bwMatrixImage: BlackWhiteMatrixImage): BlackWhiteMatrixImage {
	const rows: number[][] = [];
	for (let x = 0; x < bwMatrixImage.width; x++) {
		const cols: number[] = [];
		for (let y = bwMatrixImage.height - 1; y >= 0; y--) {
			cols.push(bwMatrixImage.data[y][x]);
		}
		rows.push(cols);
	}

	// noinspection JSSuspiciousNameCombination
	return {
		height: bwMatrixImage.width,
		width: bwMatrixImage.height,
		data: rows
	};
}

/**
 * Resize image to fit within printable area while maintaining aspect ratio.
 * 
 * Used for continuous labels to ensure the image doesn't exceed the
 * printable width. Uses nearest neighbor scaling for clean black/white results.
 * 
 * @param bwMatrixImage - Source black and white matrix image
 * @param maxWidth - Maximum allowable width in pixels
 * @param labelType - Label type for logging purposes
 * @returns Resized matrix image that fits within the specified width
 */
export function resizeImageToFit(bwMatrixImage: BlackWhiteMatrixImage, maxWidth: number, labelType: string): BlackWhiteMatrixImage {
	if (bwMatrixImage.width <= maxWidth) {
		logger.log(`Image width (${bwMatrixImage.width}px) fits within printable area (${maxWidth}px)`);
		return bwMatrixImage;
	}

	// Calculate scaling factor to fit within maxWidth
	const scale = maxWidth / bwMatrixImage.width;
	const newWidth = maxWidth;
	const newHeight = Math.floor(bwMatrixImage.height * scale);

	logger.log(`\n=== Continuous Label Image Resizing ===`);
	logger.log(`Label type: ${labelType}`);
	logger.log(`Original image: ${bwMatrixImage.width}x${bwMatrixImage.height}px`);
	logger.log(`Max printable width: ${maxWidth}px`);
	logger.log(`Scaling factor: ${(scale * 100).toFixed(1)}%`);
	logger.log(`Resized to: ${newWidth}x${newHeight}px`);
	logger.log(`=====================================\n`);

	// Create resized matrix using nearest neighbor scaling
	const resizedData: number[][] = [];
	for (let y = 0; y < newHeight; y++) {
		const srcY = Math.floor(y / scale);
		const row: number[] = [];
		for (let x = 0; x < newWidth; x++) {
			const srcX = Math.floor(x / scale);
			row.push(bwMatrixImage.data[srcY][srcX]);
		}
		resizedData.push(row);
	}

	return {
		width: newWidth,
		height: newHeight,
		data: resizedData
	};
}

/**
 * Log scaling information for debugging and user feedback.
 * 
 * @param scale - Scaling factor applied to the image
 * @param scaledWidth - Resulting width after scaling
 * @param scaledHeight - Resulting height after scaling
 */
function logScalingInfo(scale: number, scaledWidth: number, scaledHeight: number): void {
	if (scale < 1) {
		logger.log(`Image needs to be scaled DOWN by ${(scale * 100).toFixed(1)}%`);
		logger.log(`Scaled size: ${scaledWidth}x${scaledHeight}px`);
	} else if (scale > 1) {
		logger.log(`Image will be scaled UP by ${(scale * 100).toFixed(1)}%`);
		logger.log(`Scaled size: ${scaledWidth}x${scaledHeight}px`);
	} else {
		logger.log(`Image fits perfectly, no scaling needed`);
	}
}

/**
 * Scale image to fit within target dimensions while maintaining aspect ratio.
 * 
 * Uses nearest neighbor scaling to preserve sharp edges in black/white images.
 * The image is scaled to fit within the target dimensions without distortion.
 * 
 * @param bwMatrixImage - Source black and white matrix image
 * @param targetWidthPixels - Target width in pixels
 * @param targetLengthPixels - Target length in pixels
 * @returns Object containing scaled data, dimensions, and scale factor
 */
function scaleImageToTargetSize(
	bwMatrixImage: BlackWhiteMatrixImage,
	targetWidthPixels: number,
	targetLengthPixels: number
): { scaledData: number[][]; scaledWidth: number; scaledHeight: number; scale: number } {
	// Calculate scaling needed
	const widthScale = targetWidthPixels / bwMatrixImage.width;
	const lengthScale = targetLengthPixels / bwMatrixImage.height;
	const scale = Math.min(widthScale, lengthScale);
	
	const scaledWidth = Math.round(bwMatrixImage.width * scale);
	const scaledHeight = Math.round(bwMatrixImage.height * scale);
	
	logScalingInfo(scale, scaledWidth, scaledHeight);
	
	// Create scaled image data
	const scaledData: number[][] = [];
	for (let y = 0; y < scaledHeight; y++) {
		const srcY = Math.floor(y / scale);
		const row: number[] = [];
		for (let x = 0; x < scaledWidth; x++) {
			const srcX = Math.floor(x / scale);
			row.push(bwMatrixImage.data[srcY]?.[srcX] ?? 0);
		}
		scaledData.push(row);
	}

	return { scaledData, scaledWidth, scaledHeight, scale };
}

/**
 * Parameters for pixel bounds checking operations.
 * 
 * @interface PixelBounds
 */
interface PixelBounds {
	/** Scaled image data matrix */
	scaledData: number[][];
	/** Source X coordinate */
	srcX: number;
	/** Source Y coordinate */
	srcY: number;
	/** Scaled image width */
	scaledWidth: number;
	/** Scaled image height */
	scaledHeight: number;
}

/**
 * Get pixel value with bounds checking.
 * 
 * Returns 0 (white) for coordinates outside the image bounds.
 * 
 * @param params - Pixel bounds parameters
 * @returns Pixel value (0 or 1) or 0 if out of bounds
 */
function getPixelWithBounds(params: PixelBounds): number {
	const { scaledData, srcX, srcY, scaledWidth, scaledHeight } = params;
	if (srcX >= 0 && srcX < scaledWidth && srcY >= 0 && srcY < scaledHeight) {
		return scaledData[srcY][srcX];
	}
	return 0; // White background
}

/**
 * Parameters for image centering operations.
 * 
 * @interface CenteringParams
 */
interface CenteringParams {
	/** Scaled image data matrix */
	scaledData: number[][];
	/** Scaled image width */
	scaledWidth: number;
	/** Scaled image height */
	scaledHeight: number;
	/** Target width for final image */
	targetWidthPixels: number;
	/** Target length for final image */
	targetLengthPixels: number;
	/** Horizontal centering offset */
	offsetX: number;
	/** Vertical centering offset */
	offsetY: number;
}

/**
 * Create final image data with proper centering.
 * 
 * Places the scaled image within the target dimensions using the specified offsets.
 * Areas outside the scaled image are filled with white (0).
 * 
 * @param params - Centering parameters
 * @returns Final image data matrix with target dimensions
 */
function createCenteredImageData(params: CenteringParams): number[][] {
	const { scaledData, scaledWidth, scaledHeight, targetWidthPixels, targetLengthPixels, offsetX, offsetY } = params;
	const finalData: number[][] = [];
	
	for (let y = 0; y < targetLengthPixels; y++) {
		const row: number[] = [];
		for (let x = 0; x < targetWidthPixels; x++) {
			const srcX = x - offsetX;
			const srcY = y + offsetY;
			row.push(getPixelWithBounds({ scaledData, srcX, srcY, scaledWidth, scaledHeight }));
		}
		finalData.push(row);
	}
	return finalData;
}

/**
 * Parameters for ensuring image has target dimensions.
 * 
 * @interface ImageDimensionParams
 */
interface ImageDimensionParams {
	/** Scaled image data matrix */
	scaledData: number[][];
	/** Scaled image width */
	scaledWidth: number;
	/** Scaled image height */
	scaledHeight: number;
	/** Target width for final image */
	targetWidthPixels: number;
	/** Target length for final image */
	targetLengthPixels: number;
}

/**
 * Ensure scaled image data has exact target dimensions.
 * 
 * Creates a matrix with the exact target dimensions, placing the scaled image
 * at the origin (0,0) and padding with white as needed. This ensures the
 * printer receives data with the precise dimensions expected.
 * 
 * @param params - Image dimension parameters
 * @returns Final image data matrix with exact target dimensions
 */
function ensureImageDimensions(params: ImageDimensionParams): number[][] {
	const { scaledData, scaledWidth, scaledHeight, targetWidthPixels, targetLengthPixels } = params;
	
	// No centering needed - place image at origin (0,0)
	const offsetX = 0;
	const offsetY = 0;
	
	return createCenteredImageData({
		scaledData,
		scaledWidth,
		scaledHeight,
		targetWidthPixels,
		targetLengthPixels,
		offsetX,
		offsetY
	});
}

/**
 * Log calibration information for debugging and user feedback.
 * 
 * @param labelWidth - Label width being processed
 * @param calibration - Calibration parameters if available
 */
function logCalibrationInfo(labelWidth: LabelWidth, calibration: LabelCalibration | undefined): void {
	if (calibration !== undefined) {
		logger.log(`🔧 Applying calibration for ${labelWidth}:`);
		logger.log(`   Length adjustment: ${calibration.lengthAdjustmentMm}mm`);
		logger.log(`   Left offset adjustment: ${calibration.leftOffsetAdjustment}px`);
		logger.log(`   Top offset adjustment: ${calibration.topOffsetAdjustment}px`);
	}
}

/**
 * Apply calibration adjustments and log processing information.
 * 
 * Retrieves calibration parameters for the label format and applies
 * length adjustments while logging the calibration details.
 * 
 * @param labelWidth - Label width specification
 * @param lengthMm - Original label length in millimeters
 * @returns Object containing adjusted length and calibration parameters
 */
function processCalibrationAndLog(
	labelWidth: LabelWidth,
	lengthMm: number
): { adjustedLengthMm: number; calibration: LabelCalibration | undefined } {
	const hasCalibration = labelWidth in LABEL_CALIBRATIONS;
	const calibration = hasCalibration ? LABEL_CALIBRATIONS[labelWidth] : undefined;
	const adjustedLengthMm = calibration !== undefined ? lengthMm + calibration.lengthAdjustmentMm : lengthMm;
	
	logger.log(`\n=== Die-cut Image Processing ===`);
	logger.log(`Label: ${labelWidth}`);
	logCalibrationInfo(labelWidth, calibration);
	
	return { adjustedLengthMm, calibration };
}

/**
 * Process die-cut image with specific dimensions and calibration.
 * 
 * Scales and centers the image within the exact die-cut label dimensions,
 * applying any available calibration adjustments for accurate positioning.
 * 
 * @param bwMatrixImage - Source black and white matrix image
 * @param widthMm - Label width in millimeters
 * @param lengthMm - Label length in millimeters
 * @param labelWidth - Label width specification for calibration lookup
 * @returns Processed matrix image sized for the die-cut label
 */
export function processDieCutImageWithDimensions(
	bwMatrixImage: BlackWhiteMatrixImage,
	widthMm: number,
	lengthMm: number,
	labelWidth: LabelWidth
): BlackWhiteMatrixImage {
	const { adjustedLengthMm } = processCalibrationAndLog(labelWidth, lengthMm);
	
	// Convert mm to pixels at 300 DPI (Brother QL standard)
	const DPI = 300;
	const MM_TO_INCH = 0.0393701;
	const targetWidthPixels = Math.round(widthMm * MM_TO_INCH * DPI);
	const targetLengthPixels = Math.round(adjustedLengthMm * MM_TO_INCH * DPI);
	
	logger.log(`Target dimensions: ${widthMm}x${adjustedLengthMm}mm -> ${targetWidthPixels}x${targetLengthPixels}px`);
	logger.log(`Input image: ${bwMatrixImage.width}x${bwMatrixImage.height}px`);
	
	// Scale image to target size
	const { scaledData, scaledWidth, scaledHeight } = scaleImageToTargetSize(
		bwMatrixImage,
		targetWidthPixels,
		targetLengthPixels
	);
	
	// Ensure image data has exact target dimensions
	const finalData = ensureImageDimensions({
		scaledData,
		scaledWidth,
		scaledHeight,
		targetWidthPixels,
		targetLengthPixels
	});
	
	logger.log(`================================\n`);
	
	return {
		width: targetWidthPixels,
		height: targetLengthPixels,
		data: finalData
	};
}

/**
 * Process image for die-cut labels with automatic dimension detection.
 * 
 * Looks up the standard dimensions for the label format and processes
 * the image accordingly. Falls back to dimension extraction from the
 * label specification string for non-standard formats.
 * 
 * @param bwMatrixImage - Source black and white matrix image
 * @param labelWidth - Label width specification
 * @returns Processed matrix image sized for the die-cut label format
 */
export function processDieCutImage(bwMatrixImage: BlackWhiteMatrixImage, labelWidth: LabelWidth): BlackWhiteMatrixImage {
	const hasDimensions = labelWidth in DieCutLabelDimensions;
	if (hasDimensions) {
		const dimensions = DieCutLabelDimensions[labelWidth];
		return processDieCutImageWithDimensions(bwMatrixImage, dimensions.widthMm, dimensions.lengthMm, labelWidth);
	}
	
	// Try to extract dimensions from label string for new formats
	const regex = /(\d+)x(\d+)-mm-die-cut/;
	const match: RegExpExecArray | null = regex.exec(labelWidth);
	if (match !== null) {
		const widthMm = parseInt(match[1], 10);
		const lengthMm = parseInt(match[2], 10);
		return processDieCutImageWithDimensions(bwMatrixImage, widthMm, lengthMm, labelWidth);
	}
	
	logger.warn(`No dimensions found for ${labelWidth}, using original image`);
	return bwMatrixImage;
}
