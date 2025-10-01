/**
 * Brother QL Label Printer Library
 * 
 * A TypeScript/JavaScript library for printing labels on Brother QL series printers
 * via USB. Supports automatic printer detection, media detection, and comprehensive
 * label format handling.
 */

// Export main printing functions
export { printPngFile, printPngFileAuto, listAvailablePrinters } from './lib/printer/printing.js';
export { convert } from './lib/image/processing.js';

// Export printer detection and status utilities
export {
	detectBrotherPrinters,
	detectSingleBrotherPrinter,
	getPrinterCapabilities,
	queryPrinterStatus,
	hasStatusError,
	getStatusErrorMessage,
	detectLabelWidth
} from './lib/printer/detection.js';

// Export logging utilities
export { enableLogging, isLoggingEnabled } from './lib/utils/logger.js';

// Re-export all TypeScript types
export type * from './types.js';

// Example usage:
//
// import { printPngFileAuto, enableLogging } from 'node-brother-label-printer';
//
// // Optional: Enable debug logging to see detailed printer communication
// enableLogging(true);
//
// await printPngFileAuto({
//     filename: './label-image.png',
//     options: { 
//         landscape: false,
//         // Auto-detection is preferred - the printer will detect the loaded media
//         // You can specify any supported width as a fallback:
//         // - Narrow labels: "12-mm-wide continuous", "17-mm-wide continuous", etc.
//         // - Standard labels: "62-mm-wide continuous", "38x90-mm-die-cut", etc.
//         // - Wide labels: "102-mm-wide continuous" (for QL-1050/1060N)
//         labelWidth: "62-mm-wide continuous"  // Fallback if auto-detection fails
//     }
// });
//
// For direct USB control (when you know the exact printer):
//
// import { printPngFile, enableLogging } from 'node-brother-label-printer';
//
// // Optional: Enable logging via environment variable
// // DEBUG=brother-printer node your-script.js
//
// // Or enable logging programmatically
// enableLogging(true);
//
// await printPngFile({
//     vendorId: 0x04f9,
//     productId: 0x209D,  // QL-720NW
//     filename: './label-image.png',
//     options: { 
//         landscape: false, 
//         labelWidth: "62-mm-wide continuous" 
//     },
//     compression: { enable: true }
// });
//
// Supported Brother QL label sizes:
// • Continuous: 12mm, 17mm, 23mm, 29mm, 50mm, 54mm, 62mm, 102mm
// • Die-cut: 17x54mm, 17x87mm, 23x23mm, 29x42mm, 29x90mm, 38x90mm, 
//           39x48mm, 52x29mm, 54x29mm, 60x86mm, 62x29mm, 62x100mm,
//           102x51mm, 102x152mm