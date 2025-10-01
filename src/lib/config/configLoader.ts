/**
 * Configuration loader for Brother QL printer and label specifications.
 * 
 * Provides runtime loading of printer capabilities and label configurations
 * from external JSON files, enabling easy extension and customization without
 * requiring code modifications.
 * 
 * @fileoverview Configuration file loading and processing utilities
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { 
	PrinterCapabilities, 
	LabelConfiguration,
	PrinterProductId,
	PrinterModel,
	LabelWidth 
} from '../../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Try to get import.meta.url in ESM environment.
 */
function getImportMetaUrl(): string | null {
	try {
		// @ts-ignore - import.meta is only available in ESM
		const meta = import.meta;
		// Check if url property exists and is a non-empty string
		if ('url' in meta && typeof meta.url === 'string' && meta.url !== '') {
			return meta.url;
		}
	} catch {
		// Not in ESM environment
	}
	return null;
}

/**
 * Try to get __dirname in CJS environment.
 */
function getDirname(): string | null {
	try {
		// @ts-ignore - __dirname is only available in CJS
		if (typeof __dirname === 'string' && __dirname !== '') {
			// @ts-ignore - __dirname is only available in CJS
			return __dirname;
		}
	} catch {
		// Not in CJS environment
	}
	return null;
}

/**
 * Create a require function that works in both ESM and CJS environments.
 */
function createCompatibleRequire(): NodeJS.Require {
	// Try ESM approach
	const importMetaUrl = getImportMetaUrl();
	if (importMetaUrl !== null) {
		return createRequire(importMetaUrl);
	}
	
	// Try CJS approach
	try {
		// @ts-ignore - require is only available in CJS
		if (typeof require !== 'undefined') {
			// @ts-ignore - require is only available in CJS
			return require;
		}
	} catch {
		// require not available
	}
	
	// Fallback: create require from current working directory
	return createRequire(process.cwd());
}

/**
 * Get the current module's directory.
 */
function getCurrentDirectory(): string {
	// Try ESM approach
	const importMetaUrl = getImportMetaUrl();
	if (importMetaUrl !== null) {
		return path.dirname(fileURLToPath(importMetaUrl));
	}
	
	// Try CJS approach
	const dirname = getDirname();
	if (dirname !== null) {
		return dirname;
	}
	
	// Fallback
	return process.cwd();
}

/**
 * Check if a directory contains our package.json.
 */
function isOurPackageRoot(dir: string): boolean {
	const packagePath = path.join(dir, 'package.json');
	if (!fs.existsSync(packagePath)) {
		return false;
	}
	
	try {
		const packageContent = fs.readFileSync(packagePath, 'utf-8');
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- JSON.parse returns any
		const packageData = JSON.parse(packageContent);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Checking package.json structure
		return packageData.name === 'node-brother-label-printer';
	} catch {
		return false;
	}
}

/**
 * Search up the directory tree for the package root.
 */
function findPackageRootBySearching(startDir: string): string | null {
	let dir = startDir;
	const maxDepth = 10;
	
	for (let i = 0; i < maxDepth; i++) {
		if (isOurPackageRoot(dir)) {
			return dir;
		}
		
		const parent = path.dirname(dir);
		if (parent === dir) break; // Reached filesystem root
		dir = parent;
	}
	
	return null;
}

/**
 * Try to resolve the package root using Node's module resolution.
 */
function resolvePackageRoot(requireFunc: NodeJS.Require): string | null {
	try {
		const packageJsonPath = requireFunc.resolve('node-brother-label-printer/package.json');
		return path.dirname(packageJsonPath);
	} catch {
		return null;
	}
}

/**
 * Get the package root directory using Node.js standard module resolution.
 * This works in both ESM and CJS by using createRequire.
 */
function getPackageRoot(): string {
	// Create a compatible require function
	const requireFunc = createCompatibleRequire();
	
	// Try to resolve using Node's module resolution
	const resolved = resolvePackageRoot(requireFunc);
	if (resolved !== null) {
		return resolved;
	}
	
	// Fallback: search up from current directory (development mode)
	logger.warn('Could not resolve package via require.resolve, searching for package root...');
	const currentDir = getCurrentDirectory();
	
	const found = findPackageRootBySearching(currentDir);
	if (found !== null) {
		return found;
	}
	
	// Last resort fallback
	logger.error('Could not find package root, using current directory as fallback');
	return currentDir;
}

const PACKAGE_ROOT = getPackageRoot();
const CONFIG_BASE = path.join(PACKAGE_ROOT, 'config');

/** Directory containing label configuration JSON files */
const LABELS_CONFIG_DIR = path.join(CONFIG_BASE, 'labels');
/** Directory containing printer configuration JSON files */
const PRINTERS_CONFIG_DIR = path.join(CONFIG_BASE, 'printers');

/**
 * Label configuration structure as loaded from JSON files.
 * 
 * @interface LabelConfig
 */
export interface LabelConfig {
	/** Unique identifier for the label format */
	name: string;
	/** Human-readable display name */
	displayName: string;
	/** Label type classification */
	type: 'continuous' | 'die-cut';
	/** Label width in millimeters */
	widthMm: number;
	/** Label length in millimeters (die-cut labels only) */
	lengthMm?: number;
	
	/** Optional calibration parameters for positioning adjustments */
	calibration?: {
		/** Horizontal offset adjustment in pixels */
		leftOffsetAdjustment?: number;
		/** Vertical offset adjustment in pixels */
		topOffsetAdjustment?: number;
		/** Cut length adjustment in millimeters */
		lengthAdjustmentMm?: number;
		/** Special left offset override (bypasses standard calculation) */
		specialLeftOffset?: number;
		/** Whether to bypass standard offset calculations */
		bypassStandardCalculation?: boolean;
	};
	
	/** Processing group classification for optimization */
	processingGroup?: 'standard' | 'narrow' | 'wide' | 'special';
	/** Whether this label format requires special handling */
	requiresSpecialHandling?: boolean;
	/** Notes about special handling requirements */
	specialHandlingNotes?: string;
	/** Force standard quality mode (disables high quality/resolution for this label) */
	forceStandardQuality?: boolean;
	/** Whether this is a legacy format that should be skipped */
	legacy?: boolean;
}

/**
 * Printer configuration structure as loaded from JSON files.
 * 
 * @interface PrinterConfig
 */
export interface PrinterConfig {
	/** Official Brother printer model name */
	model: string;
	/** USB Product ID as hexadecimal string */
	productId: string;
	/** USB Vendor ID as hexadecimal string */
	vendorId: string;
	
	/** Hardware capabilities and specifications */
	capabilities: {
		/** Whether compression is supported */
		supportsCompression: boolean;
		/** Whether high resolution printing is supported */
		supportsHighResolution: boolean;
		/** Whether automatic cutting is supported */
		supportsAutoCut: boolean;
		/** Number of bytes per raster line */
		bytesPerLine: number;
		/** Total number of print head pins */
		totalPins: number;
		/** Maximum supported label width in millimeters */
		maxWidthMm: number;
	};
	
	/** Optional printer-specific initialization settings */
	initialization?: {
		/** Length of invalid command buffer for initialization */
		invalidCommandLength?: number;
		/** Whether explicit raster mode switching is required */
		requiresRasterModeSwitch?: boolean;
		/** Whether expanded mode commands are supported */
		expandedModeSupported?: boolean;
	};
	
	/** List of supported label processing groups */
	supportedLabelGroups: string[];
}

/**
 * Load all label configurations from JSON files in the labels config directory.
 * 
 * Scans the labels configuration directory for JSON files and parses each one
 * into a LabelConfig object. Invalid files are logged and skipped.
 * 
 * @returns Map of label configurations keyed by label name
 */
export function loadLabelConfigurations(): Map<string, LabelConfig> {
	const labels = new Map<string, LabelConfig>();
	
	try {
		// Check if config directory exists
		if (!fs.existsSync(LABELS_CONFIG_DIR)) {
			logger.warn(`Label config directory not found: ${LABELS_CONFIG_DIR}`);
			return labels;
		}
		
		// Read all JSON files in the labels directory
		const files = fs.readdirSync(LABELS_CONFIG_DIR)
		.filter(file => file.endsWith('.json'));
		
		for (const file of files) {
			const filePath = path.join(LABELS_CONFIG_DIR, file);
			try {
				const content = fs.readFileSync(filePath, 'utf-8');
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns any, but we know the structure from config files
				const config = JSON.parse(content) as LabelConfig;
				labels.set(config.name, config);
			} catch (error) {
				logger.error(`Failed to load label config ${file}:`, error);
			}
		}
	} catch (error) {
		logger.error('Failed to load label configurations:', error);
	}
	
	return labels;
}

/**
 * Load all printer configurations from JSON files in the printers config directory.
 * 
 * Scans the printers configuration directory for JSON files and parses each one
 * into a PrinterConfig object. Configurations are keyed by product ID for easy lookup.
 * 
 * @returns Map of printer configurations keyed by product ID
 */
export function loadPrinterConfigurations(): Map<string, PrinterConfig> {
	const printers = new Map<string, PrinterConfig>();
	
	try {
		// Check if config directory exists
		if (!fs.existsSync(PRINTERS_CONFIG_DIR)) {
			logger.warn(`Printer config directory not found: ${PRINTERS_CONFIG_DIR}`);
			return printers;
		}
		
		// Read all JSON files in the printers directory
		const files = fs.readdirSync(PRINTERS_CONFIG_DIR)
		.filter(file => file.endsWith('.json'));
		
		for (const file of files) {
			const filePath = path.join(PRINTERS_CONFIG_DIR, file);
			try {
				const content = fs.readFileSync(filePath, 'utf-8');
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns any, but we know the structure from config files
				const config = JSON.parse(content) as PrinterConfig;
				// Use productId as key for easy lookup
				printers.set(config.productId, config);
			} catch (error) {
				logger.error(`Failed to load printer config ${file}:`, error);
			}
		}
	} catch (error) {
		logger.error('Failed to load printer configurations:', error);
	}
	
	return printers;
}

/**
 * Get calibration parameters for a specific label format.
 * 
 * @param labelName - Name of the label format
 * @returns Calibration parameters if available, undefined otherwise
 */
export function getLabelCalibration(labelName: string): LabelConfig['calibration'] | undefined {
	const labels = loadLabelConfigurations();
	const label = labels.get(labelName);
	return label?.calibration;
}

/**
 * Get all labels of a specific type (continuous or die-cut).
 * 
 * @param type - Label type to filter by
 * @returns Array of label configurations matching the specified type
 */
export function getLabelsByType(type: 'continuous' | 'die-cut'): LabelConfig[] {
	const labels = loadLabelConfigurations();
	return Array.from(labels.values()).filter(label => label.type === type);
}

/**
 * Get all labels belonging to a specific processing group.
 * 
 * @param group - Processing group name to filter by
 * @returns Array of label configurations in the specified group
 */
export function getLabelsByProcessingGroup(group: string): LabelConfig[] {
	const labels = loadLabelConfigurations();
	return Array.from(labels.values()).filter(label => label.processingGroup === group);
}

/**
 * Convert a printer configuration to the PrinterCapabilities format.
 * 
 * Transforms the JSON configuration structure into the internal capability
 * format used by the printing system, including label configuration generation.
 * 
 * @param config - Printer configuration from JSON file
 * @returns PrinterCapabilities object for internal use
 */
export function convertToPrinterCapabilities(config: PrinterConfig): PrinterCapabilities {
	const productId = parseInt(config.productId, 16);
	
	// Generate label configurations based on printer capabilities
	const labelConfigurations = generateLabelConfigurationsForPrinter(config);
	
	return {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Config files are validated to contain valid printer models
		model: config.model as PrinterModel,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Product ID is parsed from hex string in config
		productId: productId as PrinterProductId,
		supportsCompression: config.capabilities.supportsCompression,
		supportsHighResolution: config.capabilities.supportsHighResolution,
		supportsAutoCut: config.capabilities.supportsAutoCut,
		bytesPerLine: config.capabilities.bytesPerLine,
		totalPins: config.capabilities.totalPins,
		labelConfigurations
	};
}

/**
 * Generate label configurations for a specific printer based on its capabilities.
 * 
 * Calculates pin allocations for all label formats, determining which labels
 * the printer can support and how to configure margins for each.
 * 
 * @param printer - Printer configuration
 * @returns Record mapping label widths to their pin configurations
 */
function generateLabelConfigurationsForPrinter(
	printer: PrinterConfig
): Record<LabelWidth, LabelConfiguration> {
	const configs: Record<string, LabelConfiguration> = {};
	const labels = loadLabelConfigurations();
	
	const DPI = 300;
	const MM_TO_INCH = 0.0393701;
	
	for (const [, label] of labels) {
		// Check if this printer supports this label type
		const canSupport = label.widthMm <= printer.capabilities.maxWidthMm;
		
		if (!canSupport) {
			// Printer doesn't support this label width
			configs[label.name] = {
				leftMarginPins: 0,
				printAreaPins: 0,
				rightMarginPins: 0
			};
		} else {
			// Calculate pin configuration
			const labelWidthPins = Math.round(label.widthMm * MM_TO_INCH * DPI);
			const totalMarginPins = printer.capabilities.totalPins - labelWidthPins;
			const leftMarginPins = totalMarginPins;
			const rightMarginPins = totalMarginPins - leftMarginPins;
			
			configs[label.name] = {
				leftMarginPins,
				printAreaPins: labelWidthPins,
				rightMarginPins
			};
		}
	}
	
	return configs as Record<LabelWidth, LabelConfiguration>;
}

/** Cache for loaded label configurations to avoid repeated file I/O */
let labelCache: Map<string, LabelConfig> | null = null;
/** Cache for loaded printer configurations to avoid repeated file I/O */
let printerCache: Map<string, PrinterConfig> | null = null;
/** Timestamp of last cache load for TTL management */
let lastLoadTime = 0;
/** Cache time-to-live in milliseconds (1 minute for development) */
const CACHE_TTL = 60000;

function getCachedLabelsInternal(): Map<string, LabelConfig> {
	const now = Date.now();
	if (labelCache === null || (now - lastLoadTime) > CACHE_TTL) {
		labelCache = loadLabelConfigurations();
		lastLoadTime = now;
	}
	return labelCache;
}

function getCachedPrintersInternal(): Map<string, PrinterConfig> {
	const now = Date.now();
	if (printerCache === null || (now - lastLoadTime) > CACHE_TTL) {
		printerCache = loadPrinterConfigurations();
		lastLoadTime = now;
	}
	return printerCache;
}

function clearCacheInternal(): void {
	labelCache = null;
	printerCache = null;
	lastLoadTime = 0;
}

/**
 * Get cached label configurations, loading from disk if cache is stale.
 * 
 * @returns Map of cached label configurations
 */
export const getCachedLabels = (): Map<string, LabelConfig> => getCachedLabelsInternal();

/**
 * Get cached printer configurations, loading from disk if cache is stale.
 * 
 * @returns Map of cached printer configurations
 */
export const getCachedPrinters = (): Map<string, PrinterConfig> => getCachedPrintersInternal();

/**
 * Clear the configuration cache, forcing reload on next access.
 */
export const clearConfigCache = (): void => { clearCacheInternal(); };
