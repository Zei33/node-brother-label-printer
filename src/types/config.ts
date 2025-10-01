/**
 * Configuration system types for external JSON configuration files.
 * 
 * Defines the structure of label and printer configuration files that can be
 * loaded at runtime to extend printer support and fine-tune printing behavior.
 * 
 * @fileoverview Configuration file type definitions
 */

/**
 * Label configuration structure as stored in JSON configuration files.
 * 
 * Defines label specifications, calibration parameters, and processing hints
 * for accurate printing of different label formats.
 * 
 * @interface LabelConfig
 */
export interface LabelConfig {
	/** Unique identifier for the label format */
	name: string;
	/** Human-readable name for display purposes */
	displayName: string;
	/** Label type classification */
	type: 'continuous' | 'die-cut';
	/** Label width in millimeters */
	widthMm: number;
	/** Label length in millimeters (only applicable to die-cut labels) */
	lengthMm?: number;
	
	/** Optional calibration adjustments for positioning and cutting accuracy */
	calibration?: {
		/** Horizontal offset adjustment in pixels */
		leftOffsetAdjustment?: number;
		/** Vertical offset adjustment in pixels */
		topOffsetAdjustment?: number;
		/** Cut length adjustment in millimeters */
		lengthAdjustmentMm?: number;
		/** Special left offset value (overrides calculated offset) */
		specialLeftOffset?: number;
		/** Whether to bypass standard offset calculations */
		bypassStandardCalculation?: boolean;
	};
	
	/** Processing group for optimization hints */
	processingGroup?: 'standard' | 'narrow' | 'wide' | 'special';
	/** Whether this label format requires special handling */
	requiresSpecialHandling?: boolean;
	/** Notes about special handling requirements */
	specialHandlingNotes?: string;
	
	/** Force standard quality mode (disables high quality/resolution for this label) */
	forceStandardQuality?: boolean;
	
	/** Whether this is a legacy format alias */
	legacy?: boolean;
	/** Target format this legacy alias maps to */
	mapsTo?: string;
}

/**
 * Printer configuration structure as stored in JSON configuration files.
 * 
 * Contains complete printer specifications, capabilities, and initialization
 * parameters for proper communication and feature support.
 * 
 * @interface PrinterConfig
 */
export interface PrinterConfig {
	/** Official Brother printer model name */
	model: string;
	/** USB Product ID as hexadecimal string (e.g., "0x2042") */
	productId: string;
	/** USB Vendor ID as hexadecimal string (e.g., "0x04F9") */
	vendorId: string;
	
	/** Printer hardware and feature capabilities */
	capabilities: {
		/** Whether the printer supports TIFF PackBits compression */
		supportsCompression: boolean;
		/** Whether the printer supports high resolution (300 DPI) printing */
		supportsHighResolution: boolean;
		/** Whether the printer has automatic cutting functionality */
		supportsAutoCut: boolean;
		/** Number of bytes required per raster line */
		bytesPerLine: number;
		/** Total number of pins on the print head */
		totalPins: number;
		/** Maximum supported label width in millimeters */
		maxWidthMm: number;
	};
	
	/** Optional printer-specific initialization settings */
	initialization?: {
		/** Length of invalid command buffer for initialization (default: 200) */
		invalidCommandLength?: number;
		/** Whether the printer requires explicit raster mode switching */
		requiresRasterModeSwitch?: boolean;
		/** Whether the printer supports expanded mode commands */
		expandedModeSupported?: boolean;
	};
	
	/** List of supported label processing groups */
	supportedLabelGroups: string[];
}
