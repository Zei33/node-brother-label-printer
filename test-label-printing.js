#!/usr/bin/env node

/**
 * Brother QL Label Printer Auto-Detection Test Script
 * 
 * This script automatically:
 * 1. Detects connected Brother QL printers
 * 2. Queries the printer to detect the loaded media type and dimensions  
 * 3. Uses any available sample image from the samples/ directory
 * 4. Prints the sample using the auto-detected media configuration
 * 
 * Usage:
 *   node test-label-printing.js
 *   ./test-label-printing.js
 * 
 * Prerequisites:
 * - Brother QL printer connected via USB and powered on
 * - Printer in printer mode (not mass storage mode)
 * - Label media loaded in the printer
 * - At least one PNG sample file in the samples/ directory
 * 
 * The script will use automatic detection to determine what type of
 * labels are loaded and print accordingly. You don't need to specify
 * the label type - the printer will detect it automatically.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the compiled library
import { printPngFileAuto, listAvailablePrinters, detectSingleBrotherPrinter, queryPrinterStatus, detectLabelWidth } from './dist/index.js';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SAMPLES_DIR = path.join(__dirname, 'samples');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

/**
 * Enhanced logging with colors and timestamps
 */
function log(message, color = colors.reset) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`${colors.cyan}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

function logSuccess(message) { log(`✓ ${message}`, colors.green); }
function logWarning(message) { log(`⚠ ${message}`, colors.yellow); }
function logError(message) { log(`✗ ${message}`, colors.red); }
function logInfo(message) { log(`ℹ ${message}`, colors.blue); }

/**
 * Scan samples directory for available PNG files
 */
function scanSampleFiles() {
    try {
        const files = fs.readdirSync(SAMPLES_DIR)
            .filter(file => file.toLowerCase().endsWith('.png'))
            .map(file => path.basename(file, '.png'));
        
        logInfo(`Found ${files.length} sample PNG files in ${SAMPLES_DIR}`);
        if (files.length > 0) {
            logInfo(`Available samples: ${files.join(', ')}`);
        }
        return files;
    } catch (error) {
        logError(`Failed to scan samples directory: ${error.message}`);
        return [];
    }
}

/**
 * Check if printer is available
 */
function checkPrinterAvailability() {
    try {
        const printers = listAvailablePrinters();
        if (printers.length === 0) {
            logError('No Brother QL printers detected. Please ensure:');
            console.log('  1. Printer is connected via USB');
            console.log('  2. Printer is powered on');
            console.log('  3. Printer is in printer mode (not mass storage)');
            return false;
        }
        
        logSuccess(`Found ${printers.length} available printer(s)`);
        return true;
    } catch (error) {
        logError(`Failed to detect printers: ${error.message}`);
        return false;
    }
}

/**
 * Detect loaded media and use the matching sample
 */
async function printWithAutoDetection() {
    logInfo('Starting automatic detection and printing...');
    
    // Get available sample files
    const sampleFiles = scanSampleFiles();
    
    if (sampleFiles.length === 0) {
        logError('No sample PNG files found in samples/ directory');
        logInfo('Please add sample PNG files named after the label formats (e.g., "62-mm-wide continuous.png")');
        return false;
    }
    
    logInfo('Detecting loaded media...');
    
    try {
        // First, detect what media is loaded
        const detectedPrinter = detectSingleBrotherPrinter();
        if (!detectedPrinter) {
            throw new Error('No printer detected');
        }
        
        const status = await queryPrinterStatus(detectedPrinter.device);
        const detectedLabelWidth = detectLabelWidth(status);
        
        if (!detectedLabelWidth) {
            logError('Could not detect the loaded media type');
            return false;
        }
        
        logInfo(`Detected media: ${detectedLabelWidth}`);
        
        // Convert detected label to filename format (replace spaces with hyphens)
        const detectedAsFilename = detectedLabelWidth.replace(/ /g, '-');
        
        // Check if we have a matching sample
        if (sampleFiles.includes(detectedAsFilename)) {
            const samplePath = path.join(SAMPLES_DIR, `${detectedAsFilename}.png`);
            logSuccess(`Found matching sample: ${detectedAsFilename}.png`);
            
            // Print using the matching sample
            await printPngFileAuto({
                filename: samplePath,
                options: {
                    labelWidth: detectedLabelWidth,
                    landscape: false,
                    blackwhiteThreshold: 128
                }
            });
            
            logSuccess(`Successfully printed using the matching sample: ${detectedAsFilename}.png`);
            return true;
        } else {
            logWarning(`No matching sample found for ${detectedLabelWidth}`);
            logInfo('Available samples: ' + sampleFiles.join(', '));
            logInfo(`Please add a sample file named: ${detectedAsFilename}.png`);
            
            // Try to use any available sample as a fallback
            const fallbackSample = sampleFiles[0];
            const fallbackPath = path.join(SAMPLES_DIR, `${fallbackSample}.png`);
            logInfo(`Using fallback sample: ${fallbackSample}.png`);
            
            await printPngFileAuto({
                filename: fallbackPath,
                options: {
                    labelWidth: detectedLabelWidth, // Use detected label width
                    landscape: false,
                    blackwhiteThreshold: 128
                }
            });
            
            logSuccess(`Printed fallback sample using ${detectedLabelWidth} settings`);
            return true;
        }
        
    } catch (error) {
        logError(`Auto-detection or printing failed: ${error.message}`);
        logInfo('Make sure:');
        console.log('  1. The printer has compatible label media loaded');
        console.log('  2. The media is properly inserted and detected');
        console.log('  3. The printer is ready (no errors, cover closed)');
        return false;
    }
}

/**
 * Main function
 */
async function main() {
    console.log(`${colors.cyan}Brother QL Auto-Detection Test Script${colors.reset}`);
    console.log(`${colors.cyan}====================================\n${colors.reset}`);
    
    // Check if printer is available
    if (!checkPrinterAvailability()) {
        process.exit(1);
    }
    
    // Attempt auto-detection and printing
    const success = await printWithAutoDetection();
    
    if (success) {
        logSuccess('Test completed successfully!');
    } else {
        logError('Test failed - see messages above for details');
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logError(`Uncaught exception: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logError(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    process.exit(1);
});

// Run the script when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        logError(`Script failed: ${error.message}`);
        process.exit(1);
    });
}

export { main, scanSampleFiles, printWithAutoDetection };
