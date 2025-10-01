/**
 * Brother QL printer communication and printing operations.
 * 
 * This module provides high-level printing functions with automatic printer
 * detection, status checking, media detection, and optimized image processing.
 * Includes both legacy and modern printing interfaces.
 * 
 * @fileoverview Main printing interface and USB communication
 */

import util from 'node:util';
import pngparse from 'pngparse';
import { findByIds, OutEndpoint } from 'usb';
import type { usb, Interface } from 'usb';
import { convertAdaptive } from '../image/processing.js';
import {
	detectSingleBrotherPrinter,
	getPrinterCapabilities,
	queryPrinterStatus,
	hasStatusError,
	getStatusErrorMessage,
	supportsLabelWidth,
	detectBrotherPrinters,
	detectLabelWidth,
	supportsDetectedMedia
} from './detection.js';
import { logger } from '../utils/logger.js';
import type {
	PrintPngFileParams,
	AutoPrintPngFileParams,
	DetectedPrinter,
	LabelWidth,
	PrinterStatus,
	PrintOptions,
	InterfaceResult,
	PrinterProductId
} from '../../types/index.js';
import { PrinterStatusUtils } from '../../types/index.js';

/**
 * Type guard to check if an object is a valid OutEndpoint.
 * 
 * @param obj - Object to check
 * @returns True if object is an OutEndpoint
 */
function isValidOutEndpoint(obj: unknown): obj is OutEndpoint {
	return obj !== null && 
		typeof obj === 'object' && 
		'transfer' in obj && 
		typeof (obj as { transfer: unknown }).transfer === 'function';
}

/**
 * Find the output endpoint in a USB interface.
 * 
 * @param iface - USB interface to search
 * @returns Output endpoint or null if not found
 */
function findEndpointInInterface(iface: Interface): OutEndpoint | null {
	for (const endpoint of iface.endpoints) {
		if (endpoint.direction === 'out' && endpoint instanceof OutEndpoint) {
			return endpoint;
		}
	}
	return null;
}

/**
 * Find and claim the output endpoint for printer communication.
 * 
 * Searches through all available interfaces on the printer device
 * to find a suitable output endpoint for data transmission.
 * 
 * @param printer - USB printer device
 * @returns Interface result with endpoint and claim status
 * @throws {Error} When no interfaces are found on the printer
 */
function findOutputEndpoint(printer: usb.Device): InterfaceResult {
	let outputEndpoint: OutEndpoint | null = null;
	let interfaceIndex = 0;
	let interfaceClaimed = false;

	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- interfaces can be undefined
	if (!printer.interfaces) {
		throw new Error('No interfaces found on printer');
	}

	for (const iface of printer.interfaces) {
		iface.claim();
		interfaceClaimed = true;

		outputEndpoint = findEndpointInInterface(iface);

		if (outputEndpoint !== null) {
			const { interfaceNumber } = iface;
			interfaceIndex = interfaceNumber; // store the index for release
			break; // Break out if endpoint found
		}

		iface.release(true); // Release if no endpoint found in this interface
		interfaceClaimed = false;
	}

	return { outputEndpoint, interfaceIndex, interfaceClaimed };
}

/**
 * Clean up USB interface resources.
 * 
 * Releases the claimed USB interface if it was successfully claimed.
 * 
 * @param printer - USB printer device
 * @param interfaceIndex - Index of the interface to release
 * @param interfaceClaimed - Whether the interface was successfully claimed
 */
function cleanupInterface(printer: usb.Device, interfaceIndex: number, interfaceClaimed: boolean): void {
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- interfaces can be undefined
	if (interfaceClaimed && printer.interfaces) {
		printer.interfaces[interfaceIndex].release(true); // Release interface, but keep printer open
	}
}

/**
 * Transfer data to the printer using the output endpoint.
 * 
 * Provides a promise-based interface for USB data transfer with
 * proper error handling and type safety.
 * 
 * @param outputEndpoint - USB output endpoint for data transmission
 * @param data - Buffer containing data to send to printer
 * @throws {Error} When data transfer fails
 */
async function transferData(outputEndpoint: OutEndpoint, data: Buffer): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		outputEndpoint.transfer(data, function (err) {
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- err can be null or undefined
			if (err) {
				reject(new Error(`Error sending data: ${err.message}`));
			} else {
				resolve();
			}
		});
	});
}

/**
 * Print label data to a specific printer identified by USB IDs.
 * 
 * Low-level printing function that handles USB device communication,
 * interface management, and data transfer with comprehensive error handling.
 * 
 * @param data - Complete printer data buffer to send
 * @param vendorId - USB Vendor ID (0x04F9 for Brother)
 * @param productId - USB Product ID specific to printer model
 * @throws {Error} When printer is not found or communication fails
 */
// eslint-disable-next-line complexity -- Function requires error handling for USB operations
async function printLabel(data: Buffer, vendorId: number, productId: number): Promise<void> {
	const printer = findByIds(vendorId, productId);

	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- printer can be null
	if (!printer) {
		throw new Error(`Printer not found (VID: 0x${vendorId.toString(16)}, PID: 0x${productId.toString(16)})`);
	}

	printer.open();
	let interfaceIndex = 0;
	let interfaceClaimed = false;

	try {
		const endpointResult = findOutputEndpoint(printer);
		interfaceIndex = endpointResult.interfaceIndex;
		interfaceClaimed = endpointResult.interfaceClaimed;

		if (endpointResult.outputEndpoint !== null) {
			// Type guard to ensure we have a valid OutEndpoint
			if (isValidOutEndpoint(endpointResult.outputEndpoint)) {
				await transferData(endpointResult.outputEndpoint, data);
				logger.log('Data sent successfully');
			} else {
				throw new Error('Invalid output endpoint type');
			}
			
			// Add a small delay to ensure transfer completion before cleanup
			await new Promise(resolve => setTimeout(resolve, 100));
		} else {
			throw new Error('No valid output endpoint found');
		}

	} catch (error) {
		logger.error('An error occurred:', error);
		throw error;
	} finally {
		// Always cleanup interface and close device in finally block
		try {
			cleanupInterface(printer, interfaceIndex, interfaceClaimed);
		} catch (cleanupError) {
			logger.error('Error during interface cleanup:', cleanupError);
		}
		
		try {
			// Add a small delay before closing to ensure all operations complete
			await new Promise(resolve => setTimeout(resolve, 50));
			printer.close();
		} catch (closeError) {
			logger.error('Error closing printer:', closeError);
			// Don't re-throw close errors as they're not critical
		}
	}
}

/**
 * Validate and prepare a detected printer device for printing operations.
 * 
 * Performs device validation and mode checking to ensure the printer
 * is ready for printing operations.
 * 
 * @param detectedPrinter - Detected printer information
 * @returns USB device ready for printing
 * @throws {Error} When device is invalid or in wrong mode
 */
function validateAndPrepareDevice(detectedPrinter: DetectedPrinter): usb.Device {
	// Type assertion with validation
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- device can be any type
	if (!detectedPrinter.device) {
		throw new Error('Invalid device reference');
	}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DetectedPrinter.device is typed as any
	const device = detectedPrinter.device as usb.Device;

	if (!detectedPrinter.isInPrinterMode) {
		throw new Error(`Printer ${detectedPrinter.capabilities.model} is in mass storage mode. Please press E/EL button to switch to printer mode.`);
	}

	return device;
}

/**
 * Print data using a detected printer with automatic device management.
 * 
 * High-level printing function that handles device validation, USB interface
 * setup, data transfer, and cleanup for detected printer devices.
 * 
 * @param data - Complete printer data buffer to send
 * @param detectedPrinter - Detected printer information
 * @throws {Error} When printing fails or device communication errors occur
 */
async function printWithDetectedPrinter(data: Buffer, detectedPrinter: DetectedPrinter): Promise<void> {
	const device = validateAndPrepareDevice(detectedPrinter);

	device.open();
	let interfaceIndex = 0;
	let interfaceClaimed = false;

	try {
		const endpointResult = findOutputEndpoint(device);
		interfaceIndex = endpointResult.interfaceIndex;
		interfaceClaimed = endpointResult.interfaceClaimed;

		if (endpointResult.outputEndpoint !== null) {
			// Type guard to ensure we have a valid OutEndpoint
			if (isValidOutEndpoint(endpointResult.outputEndpoint)) {
				await transferData(endpointResult.outputEndpoint, data);
				logger.log(`Data sent successfully to ${detectedPrinter.capabilities.model}`);
			} else {
				throw new Error('Invalid output endpoint type');
			}
			
			// Add a small delay to ensure transfer completion before cleanup
			await new Promise(resolve => setTimeout(resolve, 100));
		} else {
			throw new Error('No valid output endpoint found');
		}

	} catch (error) {
		logger.error('An error occurred:', error);
		throw error;
	} finally {
		// Always cleanup interface and close device in finally block
		try {
			cleanupInterface(device, interfaceIndex, interfaceClaimed);
		} catch (cleanupError) {
			logger.error('Error during interface cleanup:', cleanupError);
		}
		
		try {
			// Add a small delay before closing to ensure all operations complete
			await new Promise(resolve => setTimeout(resolve, 50));
			device.close();
		} catch (closeError) {
			logger.error('Error closing printer:', closeError);
			// Don't re-throw close errors as they're not critical
		}
	}
}

/**
 * Print a PNG file using direct USB ID specification.
 * 
 * Provides direct control over printer selection by specifying USB vendor and product IDs.
 * For automatic printer detection, use printPngFileAuto instead.
 * 
 * @param params - Print parameters including USB IDs and file path
 * @throws {Error} When file parsing fails or printing encounters errors
 */
export async function printPngFile({ vendorId, productId, filename, options, compression }: PrintPngFileParams): Promise<void> {
	const parseFile = util.promisify(pngparse.parseFile);
	const img = await parseFile(filename);

	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- img can be null/undefined
	if (!img) {
		throw new Error('Failed to parse PNG file');
	}

	// Get printer capabilities for the specified product ID
	// Type guard function to validate PrinterProductId
	const isValidPrinterProductId = (id: number): id is PrinterProductId => {
		const validProductIds: number[] = [
			0x2015, 0x2016, 0x2027, 0x2028, 0x2029, 0x201B, 0x2042, 
			0x2043, 0x2049, 0x209D, 0x2020, 0x202A, 0x2100, 0x2101
		];
		return validProductIds.includes(id);
	};
	
	if (!isValidPrinterProductId(productId)) {
		throw new Error(`Unsupported printer with product ID: 0x${productId.toString(16)}`);
	}
	const capabilities = getPrinterCapabilities(productId);
	if (capabilities === null) {
		throw new Error(`Unsupported printer with product ID: 0x${productId.toString(16)}`);
	}

	const printData = convertAdaptive(img, options, compression, capabilities);
	await printLabel(printData, vendorId, productId);
}

/**
 * Validate printer setup and label width compatibility.
 * 
 * Checks that the printer is in the correct operating mode and supports
 * the requested label width.
 * 
 * @param detectedPrinter - Detected printer information
 * @param options - Print options containing label width
 * @throws {Error} When printer is in wrong mode or doesn't support the label
 */
function validatePrinterSetup(detectedPrinter: DetectedPrinter, options: { labelWidth: LabelWidth }): void {
	// Check if printer is in correct mode
	if (!detectedPrinter.isInPrinterMode) {
		throw new Error(`Printer ${detectedPrinter.capabilities.model} is in mass storage mode. Please press the E/EL button to switch to printer mode.`);
	}

	// Validate label width support
	if (!supportsLabelWidth(detectedPrinter.capabilities, options.labelWidth)) {
		throw new Error(`Printer ${detectedPrinter.capabilities.model} does not support ${options.labelWidth} labels`);
	}
}

/**
 * Verify that the loaded media matches expected dimensions.
 * 
 * Compares the detected media width with the expected width for the
 * specified label format and logs warnings for mismatches.
 * 
 * @param status - Printer status containing media information
 * @param options - Print options containing expected label width
 */
function verifyMediaWidth(status: PrinterStatus, options: { labelWidth: LabelWidth }): void {
	const expectedWidth = options.labelWidth === "62-mm-wide continuous" ? 62 : 102;
	if (status.mediaWidth !== expectedWidth && status.mediaWidth !== 0) {
		logger.warn(`Warning: Expected ${expectedWidth}mm media, but printer reports ${status.mediaWidth}mm`);
	}
}

/**
 * Log printer status information for user feedback.
 * 
 * @param status - Printer status to log
 */
function logPrinterStatus(status: PrinterStatus): void {
	const mediaTypeText = status.mediaType === 0x0A ? 'continuous' : status.mediaType === 0x0B ? 'die-cut' : 'unknown';
	logger.log(`Printer status OK - Media: ${status.mediaWidth}mm, Type: ${mediaTypeText}`);
}

/**
 * Check printer status and validate media compatibility.
 * 
 * Queries the printer status, checks for errors, and verifies that
 * the loaded media is compatible with the print job requirements.
 * 
 * @param detectedPrinter - Detected printer information
 * @param options - Print options for media validation
 */
async function checkPrinterStatus(detectedPrinter: DetectedPrinter, options: { labelWidth: LabelWidth }): Promise<void> {
	try {
		// Type guard to ensure device is valid
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- device can be any type
		if (!detectedPrinter.device) {
			throw new Error('Invalid device object');
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DetectedPrinter.device is typed as any
		const status = await queryPrinterStatus(detectedPrinter.device as usb.Device);

		if (hasStatusError(status)) {
			const errorMessage = getStatusErrorMessage(status);
			throw new Error(`Printer error: ${errorMessage}`);
		}

		verifyMediaWidth(status, options);
		logPrinterStatus(status);
	} catch (statusError) {
		logger.warn('Could not query printer status, proceeding anyway:', statusError);
	}
}

/**
 * Check printer status and automatically detect loaded media format.
 * 
 * Queries the printer to determine the loaded media type and dimensions,
 * then attempts to match it to a supported label format.
 * 
 * @param detectedPrinter - Detected printer information
 * @returns Detected label width or null if media is unsupported
 */
async function checkPrinterStatusWithAutoDetection(detectedPrinter: DetectedPrinter): Promise<LabelWidth | null> {
	try {
		// Type guard to ensure device is valid
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- device can be any type
		if (!detectedPrinter.device) {
			throw new Error('Invalid device object');
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DetectedPrinter.device is typed as any
		const status = await queryPrinterStatus(detectedPrinter.device as usb.Device);

		if (hasStatusError(status)) {
			const errorMessage = getStatusErrorMessage(status);
			throw new Error(`Printer error: ${errorMessage}`);
		}

		// Try to automatically detect the label width
		const detectedLabelWidth = detectLabelWidth(status);
		
		if (detectedLabelWidth !== null && supportsDetectedMedia(detectedPrinter.capabilities, detectedLabelWidth)) {
			const mediaTypeText = PrinterStatusUtils.getMediaTypeDescription(status);
			logger.log(`Auto-detected media: ${status.mediaWidth}mm ${mediaTypeText} - Using ${detectedLabelWidth}`);
			return detectedLabelWidth;
		} else {
			const mediaTypeText = PrinterStatusUtils.getMediaTypeDescription(status);
			logger.warn(`Warning: Detected ${status.mediaWidth}mm ${mediaTypeText} media is not supported by ${detectedPrinter.capabilities.model}`);
		}

		return null;
	} catch (statusError) {
		logger.warn('Could not query printer status for auto-detection:', statusError);
		return null;
	}
}

/**
 * Process PNG image file and print using detected printer.
 * 
 * Handles PNG parsing, adaptive image processing based on printer capabilities,
 * and final printing with optimized settings.
 * 
 * @param filename - Path to PNG file to print
 * @param options - Print configuration options
 * @param detectedPrinter - Target printer information
 * @throws {Error} When file parsing or printing fails
 */
async function processAndPrintImage(filename: string, options: PrintOptions, detectedPrinter: DetectedPrinter): Promise<void> {
	// Parse PNG file
	const parseFile = util.promisify(pngparse.parseFile);
	const img = await parseFile(filename);

	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- img can be null/undefined
	if (!img) {
		throw new Error('Failed to parse PNG file');
	}

	// Determine compression settings based on printer capabilities
	const compression = {
		enable: detectedPrinter.capabilities.supportsCompression // Auto-enable if supported, disable if not
	};

	logger.log(`Using compression: ${compression.enable ? 'enabled' : 'disabled'} (printer ${detectedPrinter.capabilities.supportsCompression ? 'supports' : 'does not support'} compression)`);

	// Convert image with adaptive processing
	const printData = convertAdaptive(img, options, compression, detectedPrinter.capabilities);

	// Print the data
	await printWithDetectedPrinter(printData, detectedPrinter);
}

/**
 * Print a PNG file with automatic printer detection and optimization.
 * 
 * Modern printing interface that automatically detects connected printers,
 * determines optimal settings, and can auto-detect loaded media format
 * for the best printing experience.
 * 
 * @param params - Auto-print parameters including file path and options
 * @throws {Error} When no printer is detected or printing fails
 */
export async function printPngFileAuto({ filename, options, forceProductId }: AutoPrintPngFileParams): Promise<void> {
	// Detect printer
	const detectedPrinter = detectSingleBrotherPrinter(forceProductId);

	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- detectedPrinter can be null
	if (!detectedPrinter) {
		throw new Error('No Brother QL printer detected. Make sure the printer is connected and powered on.');
	}

	logger.log(`Detected printer: ${detectedPrinter.capabilities.model}`);

	// Try auto-detection of media first
	const autoDetectedLabelWidth = await checkPrinterStatusWithAutoDetection(detectedPrinter);
	
	let finalOptions = options;
	if (autoDetectedLabelWidth !== null) {
		// Use auto-detected label width
		finalOptions = { ...options, labelWidth: autoDetectedLabelWidth };
	} else {
		logger.log(`Using specified label width: ${options.labelWidth}`);
		// Validate printer setup with user-specified options
		validatePrinterSetup(detectedPrinter, options);
		// Check printer status with user-specified options
		await checkPrinterStatus(detectedPrinter, options);
	}

	// Process and print image with final options
	await processAndPrintImage(filename, finalOptions, detectedPrinter);

	logger.log('Print job completed successfully');
}

/**
 * Detect and list all available Brother QL printers.
 * 
 * Convenience function for discovering connected printers and displaying
 * their information including model, product ID, and operating mode.
 * 
 * @returns Array of all detected Brother QL printers
 */
export function listAvailablePrinters(): DetectedPrinter[] {
	const printers: DetectedPrinter[] = detectBrotherPrinters();

	if (printers.length === 0) {
		logger.log('No Brother QL printers detected');
	} else {
		logger.log('Detected Brother QL printers:');
		printers.forEach((printer: DetectedPrinter, index: number) => {
			logger.log(`  ${index + 1}. ${printer.capabilities.model} (PID: 0x${printer.capabilities.productId.toString(16)}) - ${printer.isInPrinterMode ? 'Ready' : 'Mass Storage Mode'}`);
		});
	}

	return printers;
}
