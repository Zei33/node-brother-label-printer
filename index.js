// Export main functionality for library users
export { printPngFile } from './lib/labelPrinter.js';
export { convert } from './lib/imageProcessing.js';

// Sample usage (uncomment to test):
// import { printPngFile } from './lib/labelPrinter.js';
// 
// printPngFile({
//     vendorId: 0x04f9,
//     productId: 0x209D,
//     filename: './sample.png',
//     options: { landscape: false, labelWidth: "62-mm-wide continuous" },//"102-mm-wide continuous"
//     compression: { enable: true }
// });
