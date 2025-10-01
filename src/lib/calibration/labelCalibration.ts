/**
 * Label calibration utilities for Brother QL printers.
 * 
 * This module provides calibration parameters and utility functions to address
 * printer-specific positioning and cutting variations across different label formats.
 * 
 * @fileoverview Label calibration and dimension extraction utilities
 */

import type { LabelWidth } from '../../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Calibration parameters for fine-tuning label positioning and cutting accuracy.
 * 
 * These adjustments compensate for printer-specific variations in positioning
 * and cutting behavior that can occur with certain label formats.
 * 
 * @interface LabelCalibration
 */
export interface LabelCalibration {
	/** Horizontal positioning adjustment in pixels (positive shifts right, negative shifts left) */
	leftOffsetAdjustment: number;
	/** Vertical positioning adjustment in pixels (positive shifts down, negative shifts up) */
	topOffsetAdjustment: number;
	/** Cut length adjustment in millimeters (negative reduces cut length to prevent overshooting) */
	lengthAdjustmentMm: number;
	/** Special left offset override (bypasses standard calculation) */
	specialLeftOffset?: number;
	/** Whether to bypass standard offset calculations */
	bypassStandardCalculation?: boolean;
}

/**
 * Calibration parameters for label formats with known positioning or cutting issues.
 * 
 * These calibrations have been determined through testing and provide corrections
 * for specific label formats that require adjustment from standard calculations.
 * 
 * @constant {Partial<Record<string, LabelCalibration>>} LABEL_CALIBRATIONS
 */
export const LABEL_CALIBRATIONS: Partial<Record<string, LabelCalibration>> = {};

/**
 * Extract the width in millimeters from a label specification string.
 * 
 * Supports continuous labels (e.g., "62-mm-wide continuous") and
 * die-cut labels with dimensions (e.g., "62x100-mm-die-cut").
 * 
 * @param labelWidth - Label width specification string
 * @returns Width in millimeters
 * @throws {Error} When the label specification format is not recognized
 */
export function extractLabelWidthMm(labelWidth: LabelWidth): number {
	// Handle continuous labels (e.g., "62-mm-wide continuous")
	const continuousRegex = /(\d+)-mm-wide continuous/;
	const continuousMatch = continuousRegex.exec(labelWidth);
	if (continuousMatch !== null) {
		return parseInt(continuousMatch[1], 10);
	}
	
	// Handle die-cut labels with dimensions (e.g., "62x100-mm-die-cut")
	const dieCutRegex = /(\d+)x\d+-mm-die-cut/;
	const dieCutMatch = dieCutRegex.exec(labelWidth);
	if (dieCutMatch !== null) {
		return parseInt(dieCutMatch[1], 10);
	}
	
	throw new Error(`Cannot extract width from label specification: ${labelWidth}`);
}

/**
 * Extract label length in millimeters from a die-cut label specification.
 * 
 * @param labelWidth - Label specification string
 * @returns Length in millimeters or 0 for continuous labels
 */
function extractLabelLengthMm(labelWidth: LabelWidth): number {
	if (!labelWidth.includes('die-cut')) {
		return 0; // Continuous labels have no fixed length
	}
	
	const lengthMatch = /\d+x(\d+)-mm-die-cut/.exec(labelWidth);
	if (lengthMatch !== null) {
		return parseInt(lengthMatch[1], 10);
	}
	
	return 0;
}

/**
 * Check if high quality mode should be enabled.
 * 
 * @param options - Print options
 * @returns True if high quality mode should be enabled
 */
function shouldEnableHighQuality(options?: { highResolution?: boolean; printQuality?: 'standard' | 'high' }): boolean {
	return options?.highResolution === true || options?.printQuality === 'high';
}

/**
 * Log print info byte details for debugging.
 * 
 * @param printInfo - Print info byte value
 */
function logPrintInfoByte(printInfo: number): void {
	logger.log(`DEBUG: Print info byte: 0x${printInfo.toString(16).toUpperCase()} (binary: ${printInfo.toString(2).padStart(8, '0')})`);
	logger.log(`  - Valid flag: ${(printInfo & 0x80) !== 0 ? '1' : '0'}`);
	logger.log(`  - High quality: ${(printInfo & 0x40) !== 0 ? '1' : '0'}`);
	logger.log(`  - Print recovery: ${(printInfo & 0x08) !== 0 ? '1' : '0'}`);
}

/**
 * Build the print info byte according to Brother protocol.
 * 
 * @param options - Print options
 * @returns Print info byte value
 */
function buildPrintInfoByte(options?: { highResolution?: boolean; printQuality?: 'standard' | 'high' }): number {
	// bit 7: Valid flag (always 1)
	// bit 6: Print quality (1=high/0=normal)
	// bit 5: Reserved
	// bit 4: Reserved
	// bit 3: Print recovery (always 1)
	// bit 2: Reserved
	// bit 1: Mirror print (0=off)
	// bit 0: Auto cut (handled separately, always 0 here)
	let printInfo = 0x80; // bit 7: Valid flag
	if (shouldEnableHighQuality(options)) {
		printInfo |= 0x40; // bit 6: High quality mode
	}
	printInfo |= 0x08;     // bit 3: Print recovery on
	
	logPrintInfoByte(printInfo);
	
	return printInfo;
}

/**
 * Generate printer protocol header data for a specific label width.
 * 
 * Creates the ESC i z command header with media type, width specification,
 * and raster line count according to the Brother QL printer protocol.
 * 
 * Protocol format: ESC i z [print info] [media type] [width] [length] [raster lines x4] [page] 00
 * 
 * @param labelWidth - Label width specification
 * @param rasterLines - Number of raster lines in the image
 * @param options - Header options including quality and cutting settings
 * @returns Buffer containing the formatted header command
 */
export function getLabelWidthHeaderData(
	labelWidth: LabelWidth, 
	rasterLines: number,
	options?: { 
		highResolution?: boolean;
		autoCut?: boolean;
		cutAtEnd?: boolean;
		printQuality?: 'standard' | 'high';
	}
): Buffer {
	// Pack raster line count as little-endian 32-bit
	const n5 = rasterLines & 0xFF;
	const n6 = (rasterLines >> 8) & 0xFF;
	const n7 = (rasterLines >> 16) & 0xFF;
	const n8 = (rasterLines >> 24) & 0xFF;
	
	// Determine media type
	const isDieCut = labelWidth.includes('die-cut');
	const mediaType = isDieCut ? 0x0B : 0x0A; // 0x0B for die-cut, 0x0A for continuous
	
	// Get dimensions
	const widthMm = extractLabelWidthMm(labelWidth);
	const lengthMm = extractLabelLengthMm(labelWidth);
	
	// Build print info byte
	const printInfo = buildPrintInfoByte(options);
	
	logger.log('\n=== DEBUG: Label Width Header Data ===');
	logger.log(`Label: ${labelWidth}`);
	logger.log(`Media Type: 0x${mediaType.toString(16).toUpperCase()} (${isDieCut ? 'die-cut' : 'continuous'})`);
	logger.log(`Width: ${widthMm}mm`);
	logger.log(`Length: ${lengthMm}mm (${lengthMm === 0 ? 'variable for continuous' : 'fixed for die-cut'})`);
	logger.log(`Raster Lines: ${rasterLines}`);
	logger.log(`Raster Lines Bytes: [0x${n5.toString(16)}, 0x${n6.toString(16)}, 0x${n7.toString(16)}, 0x${n8.toString(16)}]`);
	logger.log(`Print Info: 0x${printInfo.toString(16).toUpperCase()}`);
	logger.log(`=====================================\n`);
	
	// Build the header according to Brother protocol specification
	// Format from documentation: ESC i z [print info] [media type] [width] [length] [raster lines x4] [page] 00
	return Buffer.from([
		0x1b, 0x69, 0x7a,     // ESC i z command
		printInfo,            // Print information byte (CE in examples for high quality, 8E for normal)
		mediaType,            // Media type (0A=continuous, 0B=die-cut)
		widthMm,              // Width in mm
		lengthMm,             // Length in mm (0 for continuous)
		n5, n6, n7, n8,       // Raster line count (little-endian)
		0x00,                 // Starting page (always 0)
		0x00                  // Reserved
	]);
}
