/**
 * Image processing and conversion utilities for Brother QL printers.
 * 
 * Provides comprehensive image processing capabilities including format conversion,
 * printer-specific optimization, and adaptive processing for maximum compatibility
 * across all supported Brother QL printer models.
 * 
 * @fileoverview Main image processing and printer data conversion
 */
import type {
	PngImage,
	PrintOptions,
	CompressionOptions,
	LabelWidth,
	BlackWhiteMatrixImage,
	PrinterCapabilities,
	LabelConfiguration
} from '../../types/index.js';
import { 
	extractLabelWidthMm, 
	getLabelWidthHeaderData, 
	LABEL_CALIBRATIONS 
} from '../calibration/labelCalibration.js';
import { 
	convertToBlackAndWhiteMatrixImage,
	rotateMatrixImage,
	resizeImageToFit,
	processDieCutImage
} from './utils.js';
import { compressTIFF } from './compression.js';
import { loadLabelConfigurations } from '../config/configLoader.js';
import { logger } from '../utils/logger.js';

/**
 * Add printer initialization commands to the buffer sequence.
 * 
 * Adds the necessary initialization commands including invalid command buffer,
 * ESC @ initialize, and optional raster mode switching based on printer model.
 * 
 * @param buffers - Array to append initialization commands to
 * @param capabilities - Printer capabilities determining initialization sequence
 */
function addInitializationCommands(buffers: Buffer[], capabilities: PrinterCapabilities): void {
	// Invalid command length varies by model (QL-1050 needs 350, others need 200)
	const invalidLength = capabilities.model === "QL-1050" ? 350 : 200;
	buffers.push(Buffer.alloc(invalidLength)); // Clear any stuck jobs
	buffers.push(Buffer.from([0x1B, 0x40])); // ESC @ (initialize)

	// Command mode switch (only for certain models)
	if (['QL-580N', 'QL-650TD', 'QL-1050', 'QL-1060N'].includes(capabilities.model)) {
		buffers.push(Buffer.from([0x1B, 0x69, 0x61, 0x01])); // Switch to raster mode
	}
	buffers.push(Buffer.from([0x1B, 0x69, 0x21, 0x00])); // Status notification
}

/**
 * Add cutting and expanded mode commands to the buffer sequence.
 * 
 * Configures auto-cutting behavior and expanded mode settings based on
 * printer capabilities, model-specific requirements, and label type.
 * 
 * @param buffers - Array to append cutting and mode commands to
 * @param capabilities - Printer capabilities determining available features
 * @param isContinuous - Whether the label is continuous type
 * @param forceStandardQuality - Whether to force standard quality mode
 */
function addCuttingAndModeCommands(buffers: Buffer[], capabilities: PrinterCapabilities, isContinuous: boolean, forceStandardQuality: boolean): void {
	
	// Configure auto-cutting if supported
	if (capabilities.supportsAutoCut) {
		buffers.push(Buffer.from([0x1B, 0x69, 0x4D, 0x40])); // Select auto cut mode
		
		// Die-cut labels use cut-each-sheet mode, continuous labels cut at end only
		if (!isContinuous) {
			buffers.push(Buffer.from([0x1B, 0x69, 0x41, 0x01])); // Cut each sheet (die-cut only)
			logger.log('DEBUG: Using cut-each-sheet mode (0x01) for die-cut label');
		} else {
			buffers.push(Buffer.from([0x1B, 0x69, 0x41, 0x00])); // Continuous feed mode
			logger.log('DEBUG: Using continuous feed mode (0x00)');
		}
	}

	// Expanded mode (cut at end)
	if (['QL-560', 'QL-570', 'QL-580N', 'QL-650TD', 'QL-700', 'QL-1050', 'QL-1060N'].includes(capabilities.model)) {
		let expandedMode = 0x08; // Cut at end only
		// Don't use high resolution flag if forceStandardQuality is set
		if (capabilities.supportsHighResolution && !forceStandardQuality) {
			expandedMode |= 0x40; // High resolution printing
		}
		logger.log(`DEBUG: Expanded mode byte: 0x${expandedMode.toString(16).toUpperCase()} for ${capabilities.model}`);
		buffers.push(Buffer.from([0x1B, 0x69, 0x4B, expandedMode]));
	}
}

/**
 * Determine header options based on quality settings.
 * 
 * @param capabilities - Printer capabilities
 * @param forceStandardQuality - Whether to force standard quality
 * @returns Header options object
 */
function buildHeaderOptions(capabilities: PrinterCapabilities, forceStandardQuality: boolean): {
	highResolution: boolean;
	autoCut: boolean;
	cutAtEnd: boolean;
	printQuality: 'standard' | 'high';
} {
	return {
		highResolution: forceStandardQuality ? false : capabilities.supportsHighResolution,
		autoCut: capabilities.supportsAutoCut,
		cutAtEnd: true,
		printQuality: forceStandardQuality ? 'standard' as const : (capabilities.supportsHighResolution ? 'high' as const : 'standard' as const)
	};
}

/**
 * Add margin and compression commands to the buffer sequence.
 * 
 * @param buffers - Array to append commands to
 * @param isContinuous - Whether the label is continuous type
 * @param compression - Compression settings
 * @param capabilities - Printer capabilities
 */
function addMarginAndCompressionCommands(
	buffers: Buffer[],
	isContinuous: boolean,
	compression: CompressionOptions,
	capabilities: PrinterCapabilities
): void {
	// Margin settings (ESC i d) - Use appropriate margin based on label type
	const marginDots = isContinuous ? 0 : 0;
	logger.log(`DEBUG: Setting margin to ${marginDots} dots for ${isContinuous ? 'continuous' : 'die-cut'} label`);
	buffers.push(Buffer.from([0x1B, 0x69, 0x64, marginDots, 0x00]));

	// Compression mode (only if supported by printer)
	const useCompression = compression.enable && capabilities.supportsCompression;
	buffers.push(Buffer.from([0x4D, useCompression ? 0x02 : 0x00]));
}

/**
 * Create printer-specific header buffers for image data.
 * 
 * Generates the complete header sequence including initialization, label
 * specification, cutting configuration, and compression settings tailored
 * to the specific printer's capabilities.
 * 
 * @param capabilities - Target printer capabilities
 * @param compression - Compression settings
 * @param labelWidth - Target label format
 * @param rasterLines - Number of raster lines in the image
 * @returns Array of header command buffers
 */
function createAdaptiveImageHeaderBuffers(
	capabilities: PrinterCapabilities,
	compression: CompressionOptions,
	labelWidth: LabelWidth,
	rasterLines: number
): Buffer[] {
	const buffers: Buffer[] = [];

	logger.log('\n=== DEBUG: Creating Header Buffers ===');
	logger.log(`Label Width: ${labelWidth}`);
	logger.log(`Raster Lines (Image Height): ${rasterLines}`);
	logger.log(`Is Continuous: ${labelWidth.includes('continuous')}`);
	logger.log(`=====================================\n`);

	addInitializationCommands(buffers, capabilities);
	
	// Check label configuration for quality settings
	const labelConfigs = loadLabelConfigurations();
	const labelConfig = labelConfigs.get(labelWidth);
	const forceStandardQuality = labelConfig?.forceStandardQuality === true;
	
	const isContinuous = labelWidth.includes('continuous');
	const headerOptions = buildHeaderOptions(capabilities, forceStandardQuality);
	
	if (forceStandardQuality) {
		logger.log(`DEBUG: Label config forces standard quality for ${labelWidth}`);
	}
	logger.log(`DEBUG: Header options - highResolution: ${headerOptions.highResolution}, printQuality: ${headerOptions.printQuality}`);
	buffers.push(getLabelWidthHeaderData(labelWidth, rasterLines, headerOptions));
	
	addCuttingAndModeCommands(buffers, capabilities, isContinuous, forceStandardQuality);
	addMarginAndCompressionCommands(buffers, isContinuous, compression, capabilities);

	return buffers;
}

/**
 * Parameters for creating adaptive row buffers.
 * 
 * @interface RowBufferParams
 */
interface RowBufferParams {
	/** Black and white matrix image data */
	bwMatrixImage: BlackWhiteMatrixImage;
	/** Row index to process */
	y: number;
	/** Printer capabilities for margin calculations */
	capabilities: PrinterCapabilities;
	/** Whether compression format should be used */
	useCompression: boolean;
	/** Target label width for positioning */
	labelWidth: LabelWidth;
}

/**
 * Calibration data from both sources.
 */
interface CalibrationDataResult {
	hardcodedCalibration: { leftOffsetAdjustment?: number; specialLeftOffset?: number } | undefined;
	jsonCalibration: { leftOffsetAdjustment?: number; specialLeftOffset?: number } | undefined;
}

/**
 * Get calibration data from both hardcoded and JSON sources.
 * 
 * @param labelWidth - Label width specification
 * @returns Calibration data object
 */
function getCalibrationData(labelWidth: LabelWidth): CalibrationDataResult {
	const hardcodedCalibration = LABEL_CALIBRATIONS[labelWidth];
	const labelConfigs = loadLabelConfigurations();
	const labelConfigData = labelConfigs.get(labelWidth);
	const jsonCalibration = labelConfigData?.calibration;
	
	return { hardcodedCalibration, jsonCalibration };
}

/**
 * Apply hardcoded calibration adjustment.
 * 
 * @param offset - Current offset value
 * @param hardcodedCalibration - Hardcoded calibration data
 * @param labelWidth - Label width specification
 * @returns Adjusted offset
 */
function applyHardcodedAdjustment(
	offset: number,
	hardcodedCalibration: { leftOffsetAdjustment?: number } | undefined,
	labelWidth: LabelWidth
): number {
	if (hardcodedCalibration?.leftOffsetAdjustment !== undefined && hardcodedCalibration.leftOffsetAdjustment !== 0) {
		logger.log(`Applied hardcoded calibration adjustment for ${labelWidth}: ${hardcodedCalibration.leftOffsetAdjustment}px`);
		return offset + hardcodedCalibration.leftOffsetAdjustment;
	}
	return offset;
}

/**
 * Apply JSON calibration adjustment.
 * 
 * @param offset - Current offset value
 * @param jsonCalibration - JSON calibration data
 * @param labelWidth - Label width specification
 * @returns Adjusted offset
 */
function applyJsonAdjustment(
	offset: number,
	jsonCalibration: { leftOffsetAdjustment?: number } | undefined,
	labelWidth: LabelWidth
): number {
	if (jsonCalibration?.leftOffsetAdjustment !== undefined && jsonCalibration.leftOffsetAdjustment !== 0) {
		logger.log(`Applied JSON config calibration adjustment for ${labelWidth}: ${jsonCalibration.leftOffsetAdjustment}px`);
		return offset + jsonCalibration.leftOffsetAdjustment;
	}
	return offset;
}

/**
 * Apply calibration adjustments to the base offset.
 * 
 * @param baseOffset - Base left offset value
 * @param hardcodedCalibration - Hardcoded calibration data
 * @param jsonCalibration - JSON calibration data
 * @param labelWidth - Label width specification
 * @returns Adjusted offset
 */
function applyCalibrationAdjustments(
	baseOffset: number,
	hardcodedCalibration: { leftOffsetAdjustment?: number } | undefined,
	jsonCalibration: { leftOffsetAdjustment?: number } | undefined,
	labelWidth: LabelWidth
): number {
	let leftOffset = baseOffset;
	leftOffset = applyHardcodedAdjustment(leftOffset, hardcodedCalibration, labelWidth);
	leftOffset = applyJsonAdjustment(leftOffset, jsonCalibration, labelWidth);
	return leftOffset;
}

/**
 * Calculate left offset for image positioning with calibration support.
 * 
 * @param labelWidth - Label width specification
 * @param capabilities - Printer capabilities
 * @returns Calculated left offset in pixels
 */
function calculateLeftOffset(labelWidth: LabelWidth, capabilities: PrinterCapabilities): number {
	const labelConfig = capabilities.labelConfigurations[labelWidth];
	const { hardcodedCalibration, jsonCalibration } = getCalibrationData(labelWidth);
	
	// Check for special offset override (hardcoded takes precedence)
	if (hardcodedCalibration?.specialLeftOffset !== undefined) {
		logger.log(`Using hardcoded special offset for ${labelWidth}: ${hardcodedCalibration.specialLeftOffset}px`);
		return hardcodedCalibration.specialLeftOffset;
	}
	
	if (jsonCalibration?.specialLeftOffset !== undefined) {
		logger.log(`Using JSON config special offset for ${labelWidth}: ${jsonCalibration.specialLeftOffset}px`);
		return jsonCalibration.specialLeftOffset;
	}
	
	// Standard calculation with adjustments
	const leftOffset = applyCalibrationAdjustments(
		labelConfig.leftMarginPins,
		hardcodedCalibration,
		jsonCalibration,
		labelWidth
	);
	
	logger.log(`Final calculated left offset: ${leftOffset}px`);
	return leftOffset;
}

/**
 * Initialize row buffer with proper header for uncompressed data.
 * 
 * @param rowBuffer - Buffer to initialize
 * @param bytesPerLine - Number of bytes per line
 * @param useCompression - Whether compression is enabled
 */
function initializeRowBuffer(rowBuffer: Buffer, bytesPerLine: number, useCompression: boolean): void {
	if (!useCompression) {
		// Prepend command to the buffer when compression is disabled
		rowBuffer[0] = 0x67; // 'g' command
		rowBuffer[1] = 0x00; // Status byte  
		rowBuffer[2] = bytesPerLine; // Number of data bytes
	}
}

/**
 * Log positioning information for debugging (once per image).
 * 
 * @param y - Current row index
 * @param labelWidth - Label width specification
 * @param labelConfig - Label configuration
 * @param leftOffset - Calculated left offset
 */
function logPositioningInfo(y: number, labelWidth: LabelWidth, labelConfig: LabelConfiguration, leftOffset: number): void {
	if (y === 0) { // Only log once per image
		const widthMm = extractLabelWidthMm(labelWidth);
		logger.log(`Label positioning for ${labelWidth} (${widthMm}mm):`);
		logger.log(`  - Left margin pins: ${labelConfig.leftMarginPins}`);
		logger.log(`  - Print area pins: ${labelConfig.printAreaPins}`);
		logger.log(`  - Right margin pins: ${labelConfig.rightMarginPins}`);
		logger.log(`  - Final left offset: ${leftOffset}px`);
	}
}

/**
 * Write pixel to buffer for compressed format.
 * 
 * @param rowBuffer - Buffer to write to
 * @param byteNum - Byte number in buffer
 * @param bitOffset - Bit offset within byte
 * @param bytesPerLine - Number of bytes per line
 */
function writePixelCompressed(rowBuffer: Buffer, byteNum: number, bitOffset: number, bytesPerLine: number): void {
	if (byteNum >= 0 && byteNum < bytesPerLine) {
		rowBuffer[byteNum] |= (1 << bitOffset);
	}
}

/**
 * Write pixel to buffer for uncompressed format.
 * 
 * @param rowBuffer - Buffer to write to
 * @param byteNum - Byte number in buffer
 * @param bitOffset - Bit offset within byte
 * @param bytesPerLine - Number of bytes per line
 */
function writePixelUncompressed(rowBuffer: Buffer, byteNum: number, bitOffset: number, bytesPerLine: number): void {
	const bufferOffset = 3;
	const adjustedByteNum = byteNum + bufferOffset;
	if (adjustedByteNum >= bufferOffset && adjustedByteNum < bytesPerLine + bufferOffset) {
		rowBuffer[adjustedByteNum] |= (1 << bitOffset);
	}
}

/**
 * Write a pixel to the buffer using Brother's reverse byte ordering.
 * 
 * @param rowBuffer - Buffer to write to
 * @param pixelPosition - Position of the pixel
 * @param bytesPerLine - Number of bytes per line
 * @param params - Additional parameters for pixel writing
 */
function writePixelToBuffer(
	rowBuffer: Buffer,
	pixelPosition: number,
	bytesPerLine: number,
	params: { useCompression: boolean; totalPins: number }
): void {
	// Skip pixels that would be outside the buffer
	if (pixelPosition < 0 || pixelPosition >= params.totalPins) return;
	
	const byteNum = bytesPerLine - Math.floor(pixelPosition / 8 + 1);
	const bitOffset = pixelPosition % 8;
	
	if (params.useCompression) {
		writePixelCompressed(rowBuffer, byteNum, bitOffset, bytesPerLine);
	} else {
		writePixelUncompressed(rowBuffer, byteNum, bitOffset, bytesPerLine);
	}
}

/**
 * Create a raster line buffer with proper margins and bit ordering.
 * 
 * Converts a row of the black/white matrix image into the printer's expected
 * binary format, handling margin calculations, bit ordering, and printer-specific
 * positioning requirements including special cases for certain label widths.
 * 
 * @param params - Row buffer creation parameters
 * @param leftOffset - Pre-calculated left offset for positioning
 * @returns Buffer containing the formatted raster line data
 */
function createAdaptiveRowBuffer(params: RowBufferParams, leftOffset: number): Buffer {
	const { bwMatrixImage, y, capabilities, useCompression, labelWidth } = params;
	const bytesPerLine = capabilities.bytesPerLine;

	// Create buffer based on compression setting
	const rowBuffer = useCompression ? Buffer.alloc(bytesPerLine) : Buffer.alloc(bytesPerLine + 3);
	initializeRowBuffer(rowBuffer, bytesPerLine, useCompression);

	// Get label configuration and log positioning info
	const labelConfig = capabilities.labelConfigurations[labelWidth];
	logPositioningInfo(y, labelWidth, labelConfig, leftOffset);
	
	// Write pixels to buffer with Brother's reverse byte ordering
	for (let x = 0; x < bwMatrixImage.width; x++) {
		if (bwMatrixImage.data[y][x] === 1) {
			const pixelPosition = x + leftOffset;
			writePixelToBuffer(rowBuffer, pixelPosition, bytesPerLine, { 
				useCompression, 
				totalPins: capabilities.totalPins 
			});
		}
	}

	return rowBuffer;
}

/**
 * Parameters for processing adaptive row data.
 * 
 * @interface RowDataParams
 */
interface RowDataParams {
	/** Black and white matrix image data */
	bwMatrixImage: BlackWhiteMatrixImage;
	/** Row index to process */
	y: number;
	/** Printer capabilities */
	capabilities: PrinterCapabilities;
	/** Compression configuration */
	compression: CompressionOptions;
	/** Target label width */
	labelWidth: LabelWidth;
	/** Pre-calculated left offset for positioning */
	leftOffset: number;
}

/**
 * Process a single row of image data with optional compression.
 * 
 * Takes a row from the black/white matrix image and converts it to the final
 * printer format, applying compression if enabled and supported by the printer.
 * 
 * @param params - Row data processing parameters
 * @returns Buffer containing the processed row data ready for printer
 */
function processAdaptiveRowData(params: RowDataParams): Buffer {
	const { bwMatrixImage, y, capabilities, compression, labelWidth, leftOffset } = params;
	const useCompression = compression.enable && capabilities.supportsCompression;
	const rowBuffer = createAdaptiveRowBuffer({ bwMatrixImage, y, capabilities, useCompression, labelWidth }, leftOffset);

	if (useCompression) {
		// Compress the data and add command header
		const compressedData = compressTIFF(rowBuffer);
		const commandBuffer = Buffer.from([0x67, 0x00, compressedData.length]);
		let finalBuffer = Buffer.concat([commandBuffer, compressedData]);

		// Special case optimization for blank lines
		if (finalBuffer.equals(Buffer.from([0x67, 0x00, 0x02, 0xA7, 0x00]))) {
			finalBuffer = Buffer.from([0x5A]); // Zero raster command
		}

		return finalBuffer;
	} else {
		return rowBuffer;
	}
}

/**
 * Check if label format is supported by the printer.
 * 
 * @param labelConfig - Label configuration
 * @param capabilities - Printer capabilities
 * @param labelWidth - Label width specification
 * @throws {Error} When label format is not supported
 */
function checkLabelSupport(labelConfig: LabelConfiguration, capabilities: PrinterCapabilities, labelWidth: LabelWidth): void {
	if (labelConfig.printAreaPins === 0) {
		const widthMm = extractLabelWidthMm(labelWidth);
		logger.error(`ERROR: ${capabilities.model} does not support ${widthMm}mm labels`);
		logger.log(`This printer supports labels up to ${capabilities.totalPins === 720 ? '62mm' : '102mm'} wide`);
		throw new Error(`Printer ${capabilities.model} does not support ${labelWidth} labels`);
	}
}

/**
 * Validate image dimensions against printer limits.
 * 
 * @param img - Source PNG image
 * @param options - Print options
 * @param capabilities - Printer capabilities
 * @param labelConfig - Label configuration
 */
function validateImageDimensions(
	img: PngImage,
	options: PrintOptions,
	capabilities: PrinterCapabilities,
	labelConfig: LabelConfiguration
): void {
	const maxPixels = capabilities.totalPins;
	const dimensionToCheck = options.landscape === false ? img.width : img.height;
	
	if (dimensionToCheck > maxPixels) {
		const dimension = options.landscape === false ? 'Width' : 'Height';
		logger.error(`ERROR: ${dimension} ${dimensionToCheck}px exceeds printer maximum of ${maxPixels}px`);
		throw new Error(`${dimension} cannot be more than ${maxPixels} pixels for ${capabilities.model}`);
	}

	// Warn if image exceeds printable area but fits within total pins
	const printablePixels = labelConfig.printAreaPins;
	if (dimensionToCheck > printablePixels) {
		const dimension = options.landscape === false ? 'Width' : 'Height';
		logger.warn(`⚠️  Warning: ${dimension} ${dimensionToCheck}px exceeds printable area of ${printablePixels}px`);
		logger.warn(`   Image will be automatically resized to fit.`);
	}
}

/**
 * Validate printer compatibility and image dimensions.
 * 
 * Checks whether the target printer can handle the specified label format
 * and image dimensions, providing detailed error messages and warnings
 * for incompatible configurations.
 * 
 * @param img - Source PNG image
 * @param options - Print options including label width
 * @param capabilities - Target printer capabilities
 * @returns Label configuration if compatible
 * @throws {Error} When printer doesn't support the label format or image is too large
 */
function validatePrinterCompatibility(
	img: PngImage,
	options: PrintOptions,
	capabilities: PrinterCapabilities
): LabelConfiguration {
	const labelConfig = capabilities.labelConfigurations[options.labelWidth];
	
	logger.log(`\n=== Printer Compatibility Check ===`);
	logger.log(`Printer: ${capabilities.model}`);
	logger.log(`Label: ${options.labelWidth}`);
	
	checkLabelSupport(labelConfig, capabilities, options.labelWidth);
	
	logger.log(`Print area: ${labelConfig.printAreaPins} pins (${Math.round(labelConfig.printAreaPins / 11.81)}mm)`);
	logger.log(`Margins: Left=${labelConfig.leftMarginPins}, Right=${labelConfig.rightMarginPins} pins`);

	validateImageDimensions(img, options, capabilities, labelConfig);
	
	logger.log(`Validation: ✅ Passed`);
	logger.log(`===================================\n`);

	return labelConfig;
}

/**
 * Process image data and apply necessary transformations.
 * 
 * Converts the PNG image to black/white matrix format, applies rotation
 * if needed, and handles label-specific processing for die-cut vs continuous labels.
 * 
 * @param img - Source PNG image
 * @param options - Print options including landscape mode
 * @param capabilities - Printer capabilities for sizing constraints
 * @returns Processed black and white matrix image ready for printing
 */
function processImageData(img: PngImage, options: PrintOptions, capabilities: PrinterCapabilities): BlackWhiteMatrixImage {
	logger.log(`\n=== DEBUG: Starting Image Processing ===`);
	logger.log(`Input PNG dimensions: ${img.width}x${img.height}px`);
	logger.log(`Channels: ${img.channels}`);
	logger.log(`Target label: ${options.labelWidth}`);
	logger.log(`Landscape mode: ${options.landscape === true ? 'Yes' : 'No'}`);
	
	let bwMatrixImage = convertToBlackAndWhiteMatrixImage(img, options);
	
	if (options.landscape === true) {
		logger.log(`Rotating image 90 degrees for landscape mode`);
		bwMatrixImage = rotateMatrixImage(bwMatrixImage);
		logger.log(`Rotated dimensions: ${bwMatrixImage.width}x${bwMatrixImage.height}px`);
	}
	
	const isDieCut = options.labelWidth.includes('die-cut');
	
	if (isDieCut) {
		logger.log(`DEBUG: Processing die-cut label`);
		// For die-cut labels, resize and center within fixed dimensions
		bwMatrixImage = processDieCutImage(bwMatrixImage, options.labelWidth);
	} else {
		logger.log(`DEBUG: Processing continuous label`);
		// For continuous labels, resize to fit within printable area to prevent clipping
		const labelConfig = capabilities.labelConfigurations[options.labelWidth];
		logger.log(`DEBUG: Print area pins: ${labelConfig.printAreaPins}, Image width: ${bwMatrixImage.width}`);
		if (labelConfig.printAreaPins > 0 && bwMatrixImage.width > labelConfig.printAreaPins) {
			logger.log(`DEBUG: Image width exceeds print area, resizing...`);
			bwMatrixImage = resizeImageToFit(bwMatrixImage, labelConfig.printAreaPins, options.labelWidth);
		} else {
			logger.log(`DEBUG: Image fits within print area, no resizing needed`);
		}
	}
	
	logger.log(`DEBUG: Final processed image dimensions: ${bwMatrixImage.width}x${bwMatrixImage.height}px`);
	logger.log(`=====================================\n`);
	return bwMatrixImage;
}

/**
 * Apply length calibration adjustment for die-cut labels.
 * 
 * @param rasterLines - Original raster line count
 * @param labelWidth - Label width specification
 * @returns Adjusted raster line count
 */
function applyLengthCalibration(rasterLines: number, labelWidth: LabelWidth): number {
	const isDieCut = labelWidth.includes('die-cut');
	if (!isDieCut) return rasterLines;
	
	const labelConfigs = loadLabelConfigurations();
	const labelConfig = labelConfigs.get(labelWidth);
	const lengthAdjustmentMm = labelConfig?.calibration?.lengthAdjustmentMm;
	
	if (lengthAdjustmentMm !== undefined && lengthAdjustmentMm !== 0) {
		// Convert mm adjustment to pixels (11.81 dots per mm at 300dpi)
		const pixelAdjustment = Math.round(lengthAdjustmentMm * 11.81);
		const adjustedLines = Math.max(1, rasterLines + pixelAdjustment);
		logger.log(`DEBUG: Applied raster line adjustment: ${rasterLines} -> ${adjustedLines} lines (${lengthAdjustmentMm}mm = ${pixelAdjustment}px)`);
		return adjustedLines;
	}
	
	return rasterLines;
}

/**
 * Parameters for building raster line data.
 */
interface RasterLineDataParams {
	bwMatrixImage: BlackWhiteMatrixImage;
	rasterLinesToSend: number;
	capabilities: PrinterCapabilities;
	compression: CompressionOptions;
	labelWidth: LabelWidth;
	leftOffset: number;
}

/**
 * Process all raster lines and build row data buffers.
 * 
 * @param params - Parameters for building raster line data
 * @returns Array of row data buffers
 */
function buildRasterLineData(params: RasterLineDataParams): Buffer[] {
	const { bwMatrixImage, rasterLinesToSend, capabilities, compression, labelWidth, leftOffset } = params;
	const data: Buffer[] = [];
	const linesToProcess = Math.min(rasterLinesToSend, bwMatrixImage.height);
	
	for (let y = 0; y < linesToProcess; y++) {
		const rowData = processAdaptiveRowData({
			bwMatrixImage,
			y,
			capabilities,
			compression,
			labelWidth,
			leftOffset
		});
		data.push(rowData);
	}
	
	return data;
}

/**
 * Convert image to printer-specific format with adaptive processing.
 * 
 * Main entry point for image processing that adapts to specific printer
 * capabilities and provides optimal results across all supported Brother QL
 * printer models.
 * 
 * @param img - Source PNG image to convert
 * @param options - Print configuration options
 * @param compression - Compression settings
 * @param capabilities - Target printer capabilities
 * @returns Complete printer data buffer ready for USB transfer
 */
export function convert(
	img: PngImage,
	options: PrintOptions,
	compression: CompressionOptions,
	capabilities: PrinterCapabilities
): Buffer {
	validatePrinterCompatibility(img, options, capabilities);
	const bwMatrixImage = processImageData(img, options, capabilities);

	logger.log(`\n=== DEBUG: Building Print Data ===`);
	logger.log(`Final image to print: ${bwMatrixImage.width}x${bwMatrixImage.height}px`);
	
	const rasterLinesToSend = applyLengthCalibration(bwMatrixImage.height, options.labelWidth);
	logger.log(`Raster lines to send: ${rasterLinesToSend}`);
	
	// Build adaptive header data with actual raster line count
	const data: Buffer[] = createAdaptiveImageHeaderBuffers(
		capabilities,
		compression,
		options.labelWidth,
		rasterLinesToSend
	);

	// Calculate left offset once for all rows
	const leftOffset = calculateLeftOffset(options.labelWidth, capabilities);
	
	// Process each raster line with printer-specific logic
	const rasterData = buildRasterLineData({
		bwMatrixImage,
		rasterLinesToSend,
		capabilities,
		compression,
		labelWidth: options.labelWidth,
		leftOffset
	});
	data.push(...rasterData);

	// End with print command
	data.push(Buffer.from([0x1A])); // Print with feeding

	const finalBuffer = Buffer.concat(data);
	const linesToProcess = Math.min(rasterLinesToSend, bwMatrixImage.height);
	logger.log(`DEBUG: Total print data size: ${finalBuffer.length} bytes`);
	logger.log(`DEBUG: Image had ${bwMatrixImage.height} raster lines, sent ${linesToProcess} lines`);
	logger.log(`===================================\n`);
	
	return finalBuffer;
}

// Export convertAdaptive as an alias for backward compatibility
export const convertAdaptive = convert;
