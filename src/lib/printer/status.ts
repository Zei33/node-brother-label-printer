/**
 * Brother QL printer status querying and error handling utilities.
 * 
 * This module provides low-level USB communication for querying printer
 * status, parsing status responses, and interpreting error conditions
 * according to the Brother QL printer protocol.
 * 
 * @fileoverview Printer status communication and error handling
 */

import type { usb, OutEndpoint, InEndpoint, Interface } from 'usb';
import type { PrinterStatus } from '../../types/index.js';

/**
 * Type guard to check if a USB endpoint is an OutEndpoint.
 * 
 * @param endpoint - USB endpoint to check
 * @returns True if the endpoint is an OutEndpoint
 */
function isOutEndpoint(endpoint: unknown): endpoint is OutEndpoint {
	return typeof endpoint === 'object' && endpoint !== null && 
		(endpoint as { direction?: string }).direction === 'out';
}

/**
 * Type guard to check if a USB endpoint is an InEndpoint.
 * 
 * @param endpoint - USB endpoint to check
 * @returns True if the endpoint is an InEndpoint
 */
function isInEndpoint(endpoint: unknown): endpoint is InEndpoint {
	return typeof endpoint === 'object' && endpoint !== null && 
		(endpoint as { direction?: string }).direction === 'in';
}

/**
 * Parse printer status data from the 32-byte response buffer.
 * 
 * Extracts status information from the binary response according to
 * the Brother QL printer protocol specification.
 * 
 * @param data - 32-byte response buffer from printer
 * @returns Parsed printer status object
 */
function parseStatusResponse(data: Buffer): PrinterStatus {
	return {
		errorInfo1: data[8],
		errorInfo2: data[9],
		mediaWidth: data[10],
		mediaType: data[11],
		mediaLength: data[17],
		statusType: data[18],
		phaseType: data[19],
		phaseNumber: (data[21] << 8) | data[20],
		notificationNumber: data[22]
	};
}

/**
 * Setup USB interface and locate required endpoints for communication.
 * 
 * Claims the specified USB interface and finds the input and output
 * endpoints needed for status communication.
 * 
 * @param device - USB device to setup
 * @param interfaceNumber - Interface number to claim
 * @returns Object containing the interface and required endpoints
 * @throws {Error} When required endpoints are not found
 */
function setupUSBInterface(device: usb.Device, interfaceNumber: number): { iface: Interface; outEndpoint: OutEndpoint; inEndpoint: InEndpoint } {
	device.open();
	const iface = device.interface(interfaceNumber);
	iface.claim();

	const endpoints = iface.endpoints;
	const outEndpoint = endpoints.find(isOutEndpoint);
	const inEndpoint = endpoints.find(isInEndpoint);

	if (outEndpoint == null || inEndpoint == null) {
		throw new Error('Required endpoints not found');
	}

	return { iface, outEndpoint, inEndpoint };
}

/**
 * Query printer status using the ESC i S command.
 * 
 * Sends the status query command to the printer and parses the 32-byte
 * response containing error flags, media information, and operational status.
 * Includes timeout handling and proper USB resource cleanup.
 * 
 * @param device - USB device representing the printer
 * @param interfaceNumber - USB interface number to use (default: 0)
 * @returns Promise resolving to parsed printer status
 * @throws {Error} When communication fails or times out
 */
export async function queryPrinterStatus(device: usb.Device, interfaceNumber = 0): Promise<PrinterStatus> {
	return await new Promise<PrinterStatus>((resolve, reject) => {
		let iface: Interface | null = null;
		let timeoutId: NodeJS.Timeout | null = null;
		
		const cleanup = (): void => {
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			if (iface !== null) {
				try {
					iface.release(true);
				} catch (releaseError) {
					// Ignore release errors during cleanup
				}
				iface = null;
			}
		};

		try {
			const setup = setupUSBInterface(device, interfaceNumber);
			iface = setup.iface;
			const { outEndpoint, inEndpoint } = setup;
			const statusRequest = Buffer.from([0x1B, 0x69, 0x53]);

			// Set a timeout for the entire operation
			timeoutId = setTimeout(() => {
				cleanup();
				reject(new Error('Status query timeout'));
			}, 5000);

			outEndpoint.transfer(statusRequest, (error?: Error) => {
				if (error != null) {
					cleanup();
					reject(new Error(`Transfer error: ${error.message}`));
					return;
				}

				// Read 32-byte status response (minimum 23 bytes required)
				inEndpoint.transfer(32, (transferError: Error | undefined, data: Buffer | undefined) => {
					cleanup();

					if (transferError !== undefined) {
						reject(new Error(`Read error: ${transferError.message}`));
						return;
					}

					if (data == null || data.length < 23) {
						reject(new Error(`Invalid status response length: got ${data?.length ?? 0} bytes, expected at least 23`));
						return;
					}

					// Ensure buffer is 32 bytes for consistent parsing
					const paddedData = Buffer.alloc(32);
					data.copy(paddedData, 0, 0, Math.min(data.length, 32));

					resolve(parseStatusResponse(paddedData));
				});
			});
		} catch (error) {
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

/**
 * Check if printer status indicates an error condition.
 * 
 * Examines the error information bytes and status type to determine
 * if the printer is reporting any error conditions.
 * 
 * @param status - Printer status to check
 * @returns True if any error condition is detected
 */
export function hasStatusError(status: PrinterStatus): boolean {
	return status.errorInfo1 !== 0 || status.errorInfo2 !== 0 || status.statusType === 0x02;
}

/**
 * Error bit definitions for errorInfo1 byte according to Brother QL protocol.
 * 
 * @constant {Record<number, string>} ERROR_INFO1_BITS
 */
const ERROR_INFO1_BITS = {
	0x01: 'No media when printing',
	0x02: 'End of media (die-cut size only)',
	0x04: 'Tape cutter jam',
	0x10: 'Main unit in use',
	0x80: 'Fan doesn\'t work'
} as const;

/**
 * Error bit definitions for errorInfo2 byte according to Brother QL protocol.
 * 
 * @constant {Record<number, string>} ERROR_INFO2_BITS
 */
const ERROR_INFO2_BITS = {
	0x04: 'Transmission error',
	0x10: 'Cover opened while printing',
	0x40: 'Cannot feed (media may be empty)',
	0x80: 'System error'
} as const;

/**
 * Parse error bits from a status byte using bit definitions.
 * 
 * Checks each bit in the status byte against the provided error bit
 * definitions and returns an array of matching error messages.
 * 
 * @param statusByte - Status byte to parse
 * @param errorBits - Error bit definitions mapping
 * @returns Array of error messages for set bits
 */
function parseErrorBits(statusByte: number, errorBits: Record<number, string>): string[] {
	const errors: string[] = [];
	for (const [bit, message] of Object.entries(errorBits)) {
		const bitValue = Number(bit);
		if ((statusByte & bitValue) !== 0) {
			errors.push(message);
		}
	}
	return errors;
}

/**
 * Get human-readable error message from printer status.
 * 
 * Combines error information from both error bytes and returns
 * a formatted error message describing all detected issues.
 * 
 * @param status - Printer status to analyze
 * @returns Combined error message string or null if no errors
 */
export function getStatusErrorMessage(status: PrinterStatus): string | null {
	if (!hasStatusError(status)) {
		return null;
	}

	const errors: string[] = [
		...parseErrorBits(status.errorInfo1, ERROR_INFO1_BITS),
		...parseErrorBits(status.errorInfo2, ERROR_INFO2_BITS)
	];

	return errors.length > 0 ? errors.join(', ') : 'Unknown error';
}
