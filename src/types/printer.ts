/**
 * Printer-related types and interfaces for Brother QL label printers.
 * 
 * This module defines printer capabilities, status information, and detection
 * interfaces for all supported Brother QL printer models.
 * 
 * @fileoverview Printer type definitions and capability specifications
 */

import type { LabelWidth } from './label.js';

/**
 * Union type of all supported Brother QL printer model names.
 * 
 * @typedef {string} PrinterModel
 */
export type PrinterModel = 
  | "QL-500" | "QL-550" | "QL-560" | "QL-570" | "QL-580N" 
  | "QL-650TD" | "QL-700" | "QL-710W" | "QL-720NW" 
  | "QL-810W" | "QL-820NWB" | "QL-1050" | "QL-1060N"
  | "QL-1110NWB" | "QL-1115NWB";

/**
 * Union type of USB Product IDs for all supported Brother QL printers.
 * 
 * These hexadecimal values uniquely identify each printer model on the USB bus.
 * 
 * @typedef {number} PrinterProductId
 */
export type PrinterProductId = 
  | 0x2015 | 0x2016 | 0x2027 | 0x2028 | 0x2029 
  | 0x201B | 0x2042 | 0x2043 | 0x2049 | 0x209D 
  | 0x2020 | 0x202A | 0x2100 | 0x2101;

/**
 * Print head pin configuration for a specific label width.
 * 
 * Defines how the printer's pins are allocated between margins and print area
 * to properly position content on different label sizes.
 * 
 * @interface LabelConfiguration
 */
export interface LabelConfiguration {
  /** Number of print head pins allocated to the left margin */
  leftMarginPins: number;
  /** Number of print head pins available for printing content */
  printAreaPins: number;
  /** Number of print head pins allocated to the right margin */
  rightMarginPins: number;
}

/**
 * Complete capability specification for a Brother QL printer.
 * 
 * Contains all technical specifications and feature support information
 * needed to properly communicate with and configure the printer.
 * 
 * @interface PrinterCapabilities
 */
export interface PrinterCapabilities {
  /** Official Brother model name */
  model: PrinterModel;
  /** USB Product ID for device identification */
  productId: PrinterProductId;
  /** Whether the printer supports TIFF PackBits compression */
  supportsCompression: boolean;
  /** Number of bytes required per raster line in printer protocol */
  bytesPerLine: number;
  /** Total number of pins on the print head (determines maximum label width) */
  totalPins: number;
  /** Whether the printer supports high resolution (300 DPI) printing */
  supportsHighResolution: boolean;
  /** Whether the printer has automatic label cutting capability */
  supportsAutoCut: boolean;
  /** Pin configurations for all supported label widths */
  labelConfigurations: Record<LabelWidth, LabelConfiguration>;
}

/**
 * Information about a detected Brother QL printer on the system.
 * 
 * Contains the USB device reference, capability information, and current
 * operating mode status.
 * 
 * @interface DetectedPrinter
 */
export interface DetectedPrinter {
  /** USB device reference (usb.Device type, kept as unknown to avoid USB dependency) */
  device: unknown;
  /** Complete printer capability and configuration information */
  capabilities: PrinterCapabilities;
  /** Whether the device is in printer mode (false indicates mass storage mode) */
  isInPrinterMode: boolean;
}

/**
 * Printer status information parsed from the 32-byte status response.
 * 
 * Contains error flags, media information, and operational status
 * returned by the printer's status query command.
 * 
 * @interface PrinterStatus
 */
export interface PrinterStatus {
  /** Error information flags (first byte) - see Brother protocol documentation */
  errorInfo1: number;
  /** Error information flags (second byte) - see Brother protocol documentation */
  errorInfo2: number;
  /** Detected media width in millimeters (0 if no media) */
  mediaWidth: number;
  /** Media type code (0x00=none, 0x0A=continuous, 0x0B=die-cut) */
  mediaType: number;
  /** Detected media length in millimeters (0 for continuous labels) */
  mediaLength: number;
  /** Status type code (0x00=reply, 0x01=completed, 0x02=error, etc.) */
  statusType: number;
  /** Current phase type in print operation */
  phaseType: number;
  /** Current phase number in print operation */
  phaseNumber: number;
  /** Notification sequence number */
  notificationNumber: number;
}

/**
 * Utility functions for working with printer status information.
 * 
 * Provides convenient methods for interpreting status codes and media types.
 * 
 * @namespace PrinterStatusUtils
 */
export const PrinterStatusUtils = {
	/**
	 * Check if the detected media is continuous tape.
	 * @param status - Printer status object
	 * @returns True if media type indicates continuous labels
	 */
	isContinuous: (status: PrinterStatus): boolean => status.mediaType === 0x0A,
	
	/**
	 * Check if the detected media is die-cut labels.
	 * @param status - Printer status object
	 * @returns True if media type indicates die-cut labels
	 */
	isDieCut: (status: PrinterStatus): boolean => status.mediaType === 0x0B,
	
	/**
	 * Get a human-readable description of the media type.
	 * @param status - Printer status object
	 * @returns String description of the media type
	 */
	getMediaTypeDescription: (status: PrinterStatus): string => {
		switch (status.mediaType) {
			case 0x0A: return 'continuous';
			case 0x0B: return 'die-cut';
			default: return 'unknown';
		}
	}
};

/**
 * Result of USB interface setup and endpoint discovery.
 * 
 * @interface InterfaceResult
 */
export interface InterfaceResult {
	/** USB output endpoint for sending data (OutEndpoint type, kept as any to avoid USB dependency) */
	outputEndpoint: any | null;
	/** Index of the claimed USB interface */
	interfaceIndex: number;
	/** Whether the USB interface has been successfully claimed */
	interfaceClaimed: boolean;
}

/**
 * Configuration options for creating raster line buffers.
 * 
 * @interface RowBufferOptions
 */
export interface RowBufferOptions {
	/** Printer capability specifications */
	capabilities: PrinterCapabilities;
	/** Whether to use compression in the buffer format */
	useCompression: boolean;
	/** Target label width for margin calculations */
	labelWidth: LabelWidth;
}

/**
 * Configuration options for processing raster line data.
 * 
 * @interface RowProcessingOptions
 */
export interface RowProcessingOptions {
	/** Printer capability specifications */
	capabilities: PrinterCapabilities;
	/** Compression settings */
	compression: { enable: boolean };
	/** Target label width for processing */
	labelWidth: LabelWidth;
}
