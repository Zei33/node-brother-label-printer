/**
 * Brother QL printer detection and capability management.
 * 
 * This module provides comprehensive printer detection, capability lookup,
 * media detection, and status checking functionality for all supported
 * Brother QL label printer models.
 * 
 * @fileoverview Printer detection and capability management utilities
 */

import { usb } from 'usb';
import type {
	PrinterProductId,
	PrinterCapabilities,
	DetectedPrinter,
	LabelWidth,
	LabelConfiguration,
	PrinterStatus
} from '../../types/index.js';
import { loadPrinterConfigurations, loadLabelConfigurations, convertToPrinterCapabilities } from '../config/configLoader.js';
import { queryPrinterStatus, hasStatusError, getStatusErrorMessage } from './status.js';
import { logger } from '../utils/logger.js';

/** Brother's USB Vendor ID used by all Brother devices */
const BROTHER_VENDOR_ID = 0x04F9;

/**
 * Type guard to check if a string is a valid LabelWidth.
 * 
 * @param value - String to validate
 * @returns True if the string is a valid LabelWidth
 */
function isValidLabelWidth(value: string): value is LabelWidth {
	const validValues: LabelWidth[] = [
		// Continuous labels
		"12-mm-wide continuous",
		"17-mm-wide continuous",
		"23-mm-wide continuous",
		"29-mm-wide continuous",
		"50-mm-wide continuous",
		"54-mm-wide continuous",
		"62-mm-wide continuous",
		"102-mm-wide continuous",
		// Die-cut labels
		"17x54-mm-die-cut",
		"17x87-mm-die-cut",
		"23x23-mm-die-cut",
		"29x42-mm-die-cut",
		"29x90-mm-die-cut",
		"38x90-mm-die-cut",
		"39x48-mm-die-cut",
		"52x29-mm-die-cut",
		"54x29-mm-die-cut",
		"60x86-mm-die-cut",
		"62x29-mm-die-cut",
		"62x100-mm-die-cut",
		"102x51-mm-die-cut",
		"102x152-mm-die-cut"
	];
	return (validValues as string[]).includes(value);
}

/**
 * Type guard to check if a USB product ID corresponds to a supported printer.
 * 
 * Validates the product ID against the loaded printer configurations
 * to determine if it represents a supported Brother QL printer model.
 * 
 * @param productId - USB Product ID to validate
 * @returns True if the product ID corresponds to a supported printer
 */
function isValidPrinterProductId(productId: number): productId is PrinterProductId {
	const printers = loadPrinterConfigurations();
	const hexProductId = `0x${productId.toString(16).toUpperCase()}`;
	return printers.has(hexProductId);
}




/**
 * Get printer capabilities from the configuration system.
 * 
 * Looks up printer capabilities based on the USB product ID using
 * the loaded configuration files.
 * 
 * @param productId - USB Product ID of the printer
 * @returns Printer capabilities object or null if not found
 */
function getPrinterCapabilitiesFromConfig(productId: PrinterProductId): PrinterCapabilities | null {
	const printers = loadPrinterConfigurations();
	const hexProductId = `0x${productId.toString(16).toUpperCase()}`;
	const config = printers.get(hexProductId);
	
	if (config == null) {
		return null;
	}
	
	return convertToPrinterCapabilities(config);
}

/**
 * Detect all connected Brother QL printers on the system.
 * 
 * Scans all USB devices for Brother printers, validates their product IDs
 * against supported models, and returns complete printer information
 * including capabilities and operating mode status.
 * 
 * @returns Array of detected Brother QL printers with their capabilities
 */
export function detectBrotherPrinters(): DetectedPrinter[] {
	const devices = usb.getDeviceList();
	const brotherDevices = devices.filter(device =>
		device.deviceDescriptor.idVendor === BROTHER_VENDOR_ID
	);

	const detectedPrinters: DetectedPrinter[] = [];

	for (const device of brotherDevices) {
		const productId = device.deviceDescriptor.idProduct;
		if (!isValidPrinterProductId(productId)) {
			continue;
		}
		const capabilities = getPrinterCapabilitiesFromConfig(productId);
		if (capabilities == null) {
			continue;
		}

		// Determine if device is in printer mode (0x2049 indicates QL-700 mass storage mode)
		const isInPrinterMode = productId !== 0x2049;

		detectedPrinters.push({
			device,
			capabilities,
			isInPrinterMode
		});
	}

	return detectedPrinters;
}

/**
 * Detect a single Brother QL printer, with preference for printer-mode devices.
 * 
 * Attempts to find a single suitable printer, preferring devices in printer mode
 * over those in mass storage mode. If a specific product ID is provided,
 * only that model will be considered.
 * 
 * @param forceProductId - Optional specific product ID to search for
 * @returns Single detected printer or null if none found
 */
export function detectSingleBrotherPrinter(forceProductId?: PrinterProductId): DetectedPrinter | null {
	const printers = detectBrotherPrinters();

	if (printers.length === 0) {
		return null;
	}

	// If specific product ID requested, find it
	if (forceProductId !== undefined) {
		const foundPrinter = printers.find(p => p.capabilities.productId === forceProductId);
		return foundPrinter ?? null;
	}

	// Prefer printers in printer mode over mass storage mode
	const printerModeDevices = printers.filter(p => p.isInPrinterMode);
	if (printerModeDevices.length > 0) {
		return printerModeDevices[0];
	}

	// Fall back to any detected device
	return printers[0];
}

/**
 * Get printer capabilities for a specific product ID.
 * 
 * Public interface for retrieving printer capabilities based on
 * USB product ID. Used when printer capabilities are needed without
 * device detection.
 * 
 * @param productId - USB Product ID of the printer
 * @returns Printer capabilities object or null if not supported
 */
export function getPrinterCapabilities(productId: PrinterProductId): PrinterCapabilities | null {
	return getPrinterCapabilitiesFromConfig(productId);
}

/**
 * Check if a printer supports a specific label width.
 * 
 * Determines support by checking if the printer has a non-zero print area
 * configuration for the specified label width.
 * 
 * @param capabilities - Printer capabilities to check
 * @param labelWidth - Label width specification to validate
 * @returns True if the printer supports the label width
 */
export function supportsLabelWidth(capabilities: PrinterCapabilities, labelWidth: LabelWidth): boolean {
	const config = capabilities.labelConfigurations[labelWidth];
	return config.printAreaPins > 0;
}

/**
 * Get label configuration for a specific width and printer combination.
 * 
 * Retrieves the pin configuration and margin settings for a specific
 * label width on the given printer, if supported.
 * 
 * @param capabilities - Printer capabilities
 * @param labelWidth - Label width specification
 * @returns Label configuration object or null if not supported
 */
export function getLabelConfiguration(
	capabilities: PrinterCapabilities,
	labelWidth: LabelWidth
): LabelConfiguration | null {
	if (!supportsLabelWidth(capabilities, labelWidth)) {
		return null;
	}
	return capabilities.labelConfigurations[labelWidth];
}

/**
 * Automatically detect the appropriate label width from printer status.
 * 
 * Analyzes the printer's media information (width, length, type) to determine
 * the best matching label format from the supported specifications. Handles
 * both continuous and die-cut labels with tolerance for measurement variations.
 * Uses configuration data when available for improved accuracy.
 * 
 * @param status - Printer status containing media information
 * @param useConfig - Whether to use configuration-based detection enhancements
 * @returns Detected label width specification or null if unsupported
 */
// eslint-disable-next-line complexity -- Function handles comprehensive label detection
export function detectLabelWidth(status: PrinterStatus, useConfig = true): LabelWidth | null {
	const { mediaWidth, mediaType, mediaLength } = status;
	const isContinuous = mediaType === 0x0A;
	const isDieCut = mediaType === 0x0B;

	logger.log(`\n=== Label Auto-Detection ===`);
	logger.log(`Media width: ${mediaWidth}mm`);
	logger.log(`Media length: ${mediaLength}mm`);
	logger.log(`Media type: ${isDieCut ? 'die-cut' : isContinuous ? 'continuous' : 'unknown'} (0x${mediaType.toString(16).toUpperCase()})`);
	
	// If configuration is enabled, check for exact matches from config
	if (useConfig) {
		const labels = loadLabelConfigurations();
		for (const [name, config] of labels) {
			// Match based on type and dimensions
			if (config.type === 'continuous' && isContinuous && config.widthMm === mediaWidth) {
				if (isValidLabelWidth(name)) {
					logger.log(`✅ Matched from config: ${name}`);
					logger.log(`============================\n`);
					return name;
				}
			}
			if (config.type === 'die-cut' && isDieCut) {
				// Allow small tolerance for die-cut labels
				const widthMatch = Math.abs(config.widthMm - mediaWidth) <= 2;
				const lengthMatch = config.lengthMm !== undefined && Math.abs(config.lengthMm - mediaLength) <= 5;
				if (widthMatch && lengthMatch) {
					if (isValidLabelWidth(name)) {
						logger.log(`✅ Matched from config: ${name}`);
						logger.log(`============================\n`);
						return name;
					}
				}
			}
		}
	}

	// Fallback to hardcoded detection
	logger.log(`Using fallback detection logic...`);
	
	// Handle continuous labels
	if (isContinuous) {
		switch (mediaWidth) {
			case 12: return "12-mm-wide continuous";
			case 17: return "17-mm-wide continuous";
			case 23: return "23-mm-wide continuous";
			case 29: return "29-mm-wide continuous";
			case 50: return "50-mm-wide continuous";
			case 54: return "54-mm-wide continuous";
			case 62: return "62-mm-wide continuous";
			case 102: return "102-mm-wide continuous";
			default: {
				logger.log(`⚠️ Non-standard continuous width ${mediaWidth}mm, finding closest match`);
				// Try to find the closest supported width
				const continuousWidths = [12, 17, 23, 29, 50, 54, 62, 102];
				const closest = continuousWidths.reduce((prev, curr) => 
					Math.abs(curr - mediaWidth) < Math.abs(prev - mediaWidth) ? curr : prev
				);
				logger.log(`Using closest supported width: ${closest}mm`);
				
				// Type-safe mapping to LabelWidth
				const labelMap: Record<number, LabelWidth> = {
					12: "12-mm-wide continuous",
					17: "17-mm-wide continuous",
					23: "23-mm-wide continuous",
					29: "29-mm-wide continuous",
					50: "50-mm-wide continuous",
					54: "54-mm-wide continuous",
					62: "62-mm-wide continuous",
					102: "102-mm-wide continuous"
				};
				
				const result = labelMap[closest];
				logger.log(`✅ Matched: ${result}`);
				logger.log(`============================\n`);
				return result;
			}
		}
	}

	// Handle die-cut labels - match both width and length
	if (isDieCut) {
		// Try exact match first
		const exactMatches: Array<{ width: number; length: number; label: LabelWidth }> = [
			{ width: 17, length: 54, label: "17x54-mm-die-cut" },
			{ width: 17, length: 87, label: "17x87-mm-die-cut" },
			{ width: 23, length: 23, label: "23x23-mm-die-cut" },
			{ width: 29, length: 42, label: "29x42-mm-die-cut" },
			{ width: 29, length: 90, label: "29x90-mm-die-cut" },
			{ width: 38, length: 90, label: "38x90-mm-die-cut" },
			{ width: 39, length: 48, label: "39x48-mm-die-cut" },
			{ width: 52, length: 29, label: "52x29-mm-die-cut" },
			{ width: 54, length: 29, label: "54x29-mm-die-cut" },
			{ width: 60, length: 86, label: "60x86-mm-die-cut" },
			{ width: 62, length: 29, label: "62x29-mm-die-cut" },
			{ width: 62, length: 100, label: "62x100-mm-die-cut" },
			{ width: 102, length: 51, label: "102x51-mm-die-cut" },
			{ width: 102, length: 152, label: "102x152-mm-die-cut" }
		];

		// Look for exact match with tolerance
		for (const match of exactMatches) {
			if (Math.abs(match.width - mediaWidth) <= 2 && Math.abs(match.length - mediaLength) <= 5) {
				logger.log(`✅ Matched die-cut label: ${match.label}`);
				logger.log(`============================\n`);
				return match.label;
			}
		}


		logger.log(`⚠️ No exact die-cut match for ${mediaWidth}x${mediaLength}mm`);
		// Find closest match by comparing width and length
		const closestByWidth = exactMatches
		.filter(m => Math.abs(m.width - mediaWidth) <= 5)
		.sort((a, b) => Math.abs(a.length - mediaLength) - Math.abs(b.length - mediaLength));
		
		if (closestByWidth.length > 0) {
			logger.log(`✅ Using closest die-cut match: ${closestByWidth[0].label}`);
			logger.log(`============================\n`);
			return closestByWidth[0].label;
		}
	}

	logger.log(`❌ Unsupported media configuration`);
	logger.log(`============================\n`);
	return null; // Unsupported media configuration
}

/**
 * Check if a detected printer supports the detected media format.
 * 
 * Validates that the printer's capabilities include support for the
 * automatically detected label width.
 * 
 * @param capabilities - Printer capabilities to check
 * @param detectedLabelWidth - Label width detected from printer status
 * @returns True if the printer supports the detected media
 */
export function supportsDetectedMedia(capabilities: PrinterCapabilities, detectedLabelWidth: LabelWidth): boolean {
	const config = capabilities.labelConfigurations[detectedLabelWidth];
	return config.printAreaPins > 0;
}

// Re-export status functions for convenient access
export { queryPrinterStatus, hasStatusError, getStatusErrorMessage };
