# node-brother-label-printer

[![Version](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Zei33/0959a9de4515533d33a2f09c220303dd/raw/node-brother-label-printer-version.json)](https://github.com/Zei33/node-brother-label-printer/releases)
[![License](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Zei33/0959a9de4515533d33a2f09c220303dd/raw/node-brother-label-printer-license.json)](https://github.com/Zei33/node-brother-label-printer/blob/main/LICENSE.md)
[![Build](https://github.com/Zei33/node-brother-label-printer/actions/workflows/ci.yml/badge.svg)](https://github.com/Zei33/node-brother-label-printer/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Zei33/0959a9de4515533d33a2f09c220303dd/raw/node-brother-label-printer-jest-tests.json)](https://github.com/Zei33/node-brother-label-printer/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Zei33/0959a9de4515533d33a2f09c220303dd/raw/node-brother-label-printer-lcov-coverage.json)](https://github.com/Zei33/node-brother-label-printer/actions/workflows/ci.yml)

A modern TypeScript library for printing PNG images with Brother Label Printers. Features **automatic printer detection**, **comprehensive label support** (12mm to 102mm), and **adaptive compatibility** for all Brother QL models connected via USB.

## Supported Printers

### Fully Tested & Supported
- **QL-700** ✨ *Newly added with specialized compatibility*
- QL-710W, QL-720NW, QL-810W, QL-820NWB
- QL-1110NWB, QL-1115NWB

### Legacy Support (via capability mapping)
- QL-500, QL-550, QL-560, QL-570, QL-580N
- QL-650TD, QL-1050, QL-1060N

## Features

- 🔥 **TypeScript Support** - Full type definitions included
- 🤖 **Auto-Detection** - Automatically detects printer model and loaded media
- 📏 **All Label Sizes** - Supports EVERY Brother QL label from 12mm to 102mm
- 🎯 **Smart Media Detection** - Auto-detects loaded label size and type
- 🖼️ **Intelligent Image Processing** - Auto-resize, center, and optimize for any label
- 🔧 **Adaptive Processing** - Optimizes print data based on printer capabilities
- 📊 **Status Monitoring** - Real-time printer status checking and error reporting
- 🗜️ **Smart Compression** - Automatically enables/disables based on printer support
- 🎛️ **JSON Configuration System** - Extend printer and label support via config files
- 🔬 **Calibration System** - Fine-tune positioning and cutting for specific labels
- 📦 **Dual Module Support** - Works with both CommonJS and ES Modules
- 📝 **Optional Debug Logging** - Enable detailed logging when needed, silent by default

## Installation

```bash
npm install node-brother-label-printer
```

### Platform-specific Requirements

If you use USB as an adapter:

- On Linux, you'll need `libudev` to build libusb.
- On Ubuntu/Debian: `sudo apt-get install build-essential libudev-dev`.
- On Windows, Use [Zadig](http://sourceforge.net/projects/libwdi/files/zadig/) to install the WinUSB driver for your USB device.

Otherwise you will get `LIBUSB_ERROR_NOT_SUPPORTED` when attempting to open devices.

## Debug Logging

By default, the library suppresses verbose debug logs to avoid cluttering your console. **Errors and warnings are always shown** regardless of logging settings, ensuring you never miss critical issues. You can enable detailed debug logging in two ways:

### Via Environment Variable

```bash
# Enable logging for this library
DEBUG=brother-printer node your-script.js

# Or enable all debug logging
DEBUG=* node your-script.js
```

### Programmatically

```typescript
import { enableLogging, printPngFileAuto } from 'node-brother-label-printer';

// Enable debug logging
enableLogging(true);

// Now all operations will show detailed logs
await printPngFileAuto({
  filename: './sample.png',
  options: { labelWidth: '62-mm-wide continuous' }
});

// Disable logging when done
enableLogging(false);
```

When enabled, you'll see detailed debug information about:
- 🔍 Printer detection and capabilities
- 📏 Media detection and label configuration
- 🖼️ Image processing steps (resizing, rotation, conversion)
- 📊 Print data generation and compression
- 🔧 Calibration adjustments

**Note:** Errors and warnings are always visible, even when debug logging is disabled.

## Usage

### 🚀 Auto-Detection (Recommended)

The new auto-detection feature automatically finds your printer and optimizes settings:

```typescript
import { printPngFileAuto, listAvailablePrinters } from 'node-brother-label-printer';

// Simple auto-detection usage - detects both printer AND media
await printPngFileAuto({
  filename: './sample.png',
  options: { 
    landscape: false, 
    // Label width is auto-detected from loaded media!
    // Specify as fallback only if auto-detection fails:
    labelWidth: '62-mm-wide continuous',
    blackwhiteThreshold: 128 // Optional, defaults to 128
  }
  // Printer detection, media detection, image resizing all automatic! 🎉
});

// List available printers
const printers = listAvailablePrinters();
console.log('Available printers:', printers);

// All supported label widths:
// Continuous: '12-mm-wide continuous', '17-mm-wide continuous', 
//            '23-mm-wide continuous', '29-mm-wide continuous',
//            '50-mm-wide continuous', '54-mm-wide continuous',
//            '62-mm-wide continuous', '102-mm-wide continuous'
// Die-cut:   '17x54-mm-die-cut', '29x90-mm-die-cut', '38x90-mm-die-cut',
//            '62x100-mm-die-cut', '102x152-mm-die-cut', and many more!

// Force specific printer if multiple detected
await printPngFileAuto({
  filename: './sample.png',
  options: { labelWidth: '29-mm-wide continuous' }, // Any size works!
  forceProductId: 0x2042 // Force QL-700
});
```

### 🔧 Manual Configuration (Legacy)

For backward compatibility or when you need manual control:

```typescript
import { printPngFile, type PrintPngFileParams } from 'node-brother-label-printer';

const printParams: PrintPngFileParams = {
  vendorId: 0x04f9,
  productId: 0x2042, // QL-700
  filename: './sample.png',
  options: { 
    landscape: false, 
    labelWidth: '29-mm-wide continuous', // Now supports all sizes!
    blackwhiteThreshold: 128
  },
  compression: { enable: false } // QL-700 doesn't support compression
};

await printPngFile(printParams);
```

### 📊 Advanced Usage with Status Monitoring

```typescript
import { 
  detectSingleBrotherPrinter, 
  queryPrinterStatus, 
  hasStatusError,
  getStatusErrorMessage 
} from 'node-brother-label-printer';

// Detect printer and check status
const printer = detectSingleBrotherPrinter();
if (!printer) {
  throw new Error('No printer found');
}

console.log(`Found: ${printer.capabilities.model}`);

// Check printer status before printing
const status = await queryPrinterStatus(printer.device);
if (hasStatusError(status)) {
  console.error('Printer error:', getStatusErrorMessage(status));
} else {
  console.log('Printer ready!');
}
```

### CommonJS

```javascript
const { printPngFileAuto } = require('node-brother-label-printer');

// Auto-detection works with CommonJS too
printPngFileAuto({
  filename: './sample.png',
  options: { 
    landscape: false, 
    labelWidth: '62-mm-wide continuous' 
  }
}).then(() => {
  console.log('Print job sent successfully!');
}).catch(error => {
  console.error('Print failed:', error);
});
```

## 🎯 QL-700 Specific Improvements

The QL-700 has been specifically optimized with fixes for known compatibility issues:

### Key Fixes Applied
- ✅ **Compression Disabled**: QL-700 doesn't support TIFF compression (unlike newer models)
- ✅ **Correct Raster Format**: Fixed MSB-first bit ordering and proper 90-byte raster lines
- ✅ **Proper Margins**: Uses correct 12-pin left/right margins for 62mm labels
- ✅ **Dynamic Headers**: Print info header uses actual image height instead of hard-coded values
- ✅ **Mass Storage Detection**: Automatically detects and warns about Editor Lite mode

### QL-700 Usage Notes
```typescript
// The library automatically handles QL-700 quirks
const printer = detectSingleBrotherPrinter();
if (printer?.capabilities.model === 'QL-700') {
  console.log('QL-700 detected - optimizations applied automatically');
  // Compression will be disabled automatically
  // Margins and raster format optimized for QL-700
}
```

### Troubleshooting QL-700

**Problem**: Printer blinks green but doesn't print
- **Solution**: Make sure printer is in Printer Mode, not Editor Lite (mass storage) mode
- **Fix**: Press the E/EL button to switch modes

**Problem**: "Printer is in mass storage mode" error
- **Solution**: The QL-700 has a dual-mode switch. Use the E/EL button to switch to printer mode

**Problem**: Print quality issues or garbled output
- **Solution**: The new adaptive processing handles this automatically with proper bit ordering and margins

### Advanced Image Processing

```typescript
import { 
  convert, 
  getPrinterCapabilities,
  type PngImage, 
  type PrintOptions 
} from 'node-brother-label-printer';
import { parseFile } from 'pngparse';
import { promisify } from 'util';

const parseFileAsync = promisify(parseFile);

async function processAndPrint() {
  // Parse PNG file
  const image: PngImage = await parseFileAsync('./my-label.png');
  
  // Get printer capabilities
  const capabilities = getPrinterCapabilities(0x2042); // QL-700
  if (!capabilities) throw new Error('Printer not supported');
  
  // Convert to printer format - now supports all label sizes!
  const printData = convert(image, {
    landscape: true,
    labelWidth: '17-mm-wide continuous', // Even narrow labels work!
    blackwhiteThreshold: 150
  }, {
    enable: true // Compression auto-disabled if not supported
  }, capabilities);
  
  // The library will automatically:
  // - Resize image to fit 17mm width
  // - Center the image on the label
  // - Adjust margins appropriately
  // - Apply printer-specific optimizations
  // - Log all adjustments made
  console.log(`Generated ${printData.length} bytes of print data`);
}
```

## 🎛️ Configuration System

The library includes a powerful JSON-based configuration system for printers and labels, allowing you to extend support and fine-tune behavior without modifying code.

### Configuration Files

Configuration files are stored in the `config/` directory:

- **`config/printers/`** - Printer specifications (capabilities, USB IDs, initialization)
- **`config/labels/`** - Label specifications (dimensions, calibrations)

### Adding New Printers

Create a JSON file in `config/printers/` with your printer's specifications:

```json
{
  "model": "QL-700",
  "productId": "0x2042",
  "vendorId": "0x04F9",
  "capabilities": {
    "supportsCompression": false,
    "supportsHighResolution": false,
    "supportsAutoCut": true,
    "bytesPerLine": 90,
    "totalPins": 720,
    "maxWidthMm": 62
  },
  "initialization": {
    "invalidCommandLength": 200,
    "requiresRasterModeSwitch": false,
    "expandedModeSupported": true
  },
  "supportedLabelGroups": ["standard", "narrow", "special"]
}
```

### Adding New Labels

Create a JSON file in `config/labels/` with label specifications and calibration:

```json
{
  "name": "29x90-mm-die-cut",
  "displayName": "29x90 Mm Die Cut",
  "type": "die-cut",
  "widthMm": 29,
  "lengthMm": 90,
  "calibration": {
    "leftOffsetAdjustment": 4,
    "lengthAdjustmentMm": -5.25
  },
  "processingGroup": "standard",
  "requiresSpecialHandling": false,
  "specialHandlingNotes": "Negative length adjustment prevents cutting overshoot into next label"
}
```

### Calibration Parameters

Fine-tune printing behavior for specific label formats:

- **`leftOffsetAdjustment`** - Horizontal positioning adjustment in pixels (+ = right, - = left)
- **`topOffsetAdjustment`** - Vertical positioning adjustment in pixels (+ = down, - = up)  
- **`lengthAdjustmentMm`** - Die-cut labels only: Adjusts raster lines sent to prevent cutting overshoots (- = send fewer lines for shorter cut, + = send more lines)

**Advanced calibration options** (rarely needed):
- **`specialLeftOffset`** - Override value for special positioning cases (bypasses standard calculation)
- **`bypassStandardCalculation`** - Whether to bypass standard margin calculations entirely

**Note**: Most labels only need `leftOffsetAdjustment` and/or `lengthAdjustmentMm`. The advanced options are for special cases with unique positioning requirements.

See `config/README.md` for detailed calibration guidelines and testing procedures.

### Configuration Loading

The configuration system automatically loads JSON files from the `config/` directory at runtime:

- **Caching**: Configurations are cached for 1 minute during development to avoid repeated file I/O
- **Auto-reload**: Changes to config files are picked up automatically after cache expiration
- **Validation**: Invalid config files are logged and skipped, not blocking library operation

### Supported Label Sizes Reference

#### Continuous Labels (Tape Rolls)
| Width | Use Case | Example Declaration |
|-------|----------|--------------------|
| 12mm | Cables, small items | `'12-mm-wide continuous'` |
| 17mm | File folders | `'17-mm-wide continuous'` |
| 23mm | Name badges | `'23-mm-wide continuous'` |
| 29mm | Address labels | `'29-mm-wide continuous'` |
| 50mm | Shipping labels | `'50-mm-wide continuous'` |
| 54mm | Large addresses | `'54-mm-wide continuous'` |
| 62mm | Standard shipping | `'62-mm-wide continuous'` |
| 102mm | Wide format (QL-1050/1060N) | `'102-mm-wide continuous'` |

#### Die-Cut Labels (Pre-cut)
| Size | Use Case | Example Declaration |
|------|----------|--------------------|
| 17×54mm | Small labels | `'17x54-mm-die-cut'` |
| 29×90mm | Address labels | `'29x90-mm-die-cut'` |
| 38×90mm | Shipping labels | `'38x90-mm-die-cut'` |
| 62×100mm | Large shipping | `'62x100-mm-die-cut'` |
| 102×152mm | Extra large (QL-1050/1060N) | `'102x152-mm-die-cut'` |

### Label Auto-Detection Example

```typescript
import { 
  detectSingleBrotherPrinter,
  queryPrinterStatus,
  detectLabelWidth 
} from 'node-brother-label-printer';

// Detect printer and loaded media
const printer = detectSingleBrotherPrinter();
if (printer) {
  const status = await queryPrinterStatus(printer.device);
  console.log(`Loaded media: ${status.mediaWidth}mm`);
  
  // Auto-detect appropriate label configuration
  const detectedLabel = detectLabelWidth(status);
  console.log(`Using label: ${detectedLabel}`);
  
  // Print with auto-detected settings
  await printPngFileAuto({
    filename: './label.png',
    options: { labelWidth: detectedLabel || '62-mm-wide continuous' }
  });
}
```

## API Reference

### Core Printing Functions

#### `printPngFileAuto(params: AutoPrintPngFileParams): Promise<void>`

**Recommended** - Print with automatic printer and media detection.

```typescript
await printPngFileAuto({
  filename: './label.png',
  options: { 
    labelWidth: '62-mm-wide continuous', // Auto-detected if not specified
    landscape: false,
    blackwhiteThreshold: 128
  },
  forceProductId?: 0x2042 // Optional: force specific printer
});
```

#### `printPngFile(params: PrintPngFileParams): Promise<void>`

Legacy function for manual printer specification.

**Parameters:**
- `vendorId: number` - USB Vendor ID (e.g., `0x04f9` for Brother)
- `productId: number` - USB Product ID (e.g., `0x2042` for QL-700)
- `filename: string` - Path to PNG file
- `options: PrintOptions` - Print configuration
  - `landscape?: boolean` - Rotate image 90° (default: `false`)
  - `labelWidth: LabelWidth` - Label size specification
  - `blackwhiteThreshold?: number` - B&W conversion threshold 0-255 (default: `128`)
- `compression: CompressionOptions` - Compression settings
  - `enable: boolean` - Enable/disable compression

#### `convert(image: PngImage, options: PrintOptions, compression: CompressionOptions, capabilities: PrinterCapabilities): Buffer`

Convert a parsed PNG image to Brother printer format with adaptive processing.

### Printer Detection Functions

#### `detectBrotherPrinters(): DetectedPrinter[]`

Detect all connected Brother QL printers.

```typescript
const printers = detectBrotherPrinters();
printers.forEach(p => {
  console.log(`${p.capabilities.model} - ${p.isInPrinterMode ? 'Ready' : 'Mass Storage Mode'}`);
});
```

#### `detectSingleBrotherPrinter(forceProductId?: PrinterProductId): DetectedPrinter | null`

Detect a single printer, optionally filtering by product ID.

#### `listAvailablePrinters(): DetectedPrinter[]`

List all available printers with console output.

#### `getPrinterCapabilities(productId: PrinterProductId): PrinterCapabilities | null`

Get capabilities for a specific printer model.

### Status and Media Detection

#### `queryPrinterStatus(device: usb.Device): Promise<PrinterStatus>`

Query printer status including media information and errors.

```typescript
const status = await queryPrinterStatus(printer.device);
console.log(`Media: ${status.mediaWidth}mm, Type: ${status.mediaType}`);
```

#### `hasStatusError(status: PrinterStatus): boolean`

Check if printer status indicates an error condition.

#### `getStatusErrorMessage(status: PrinterStatus): string | null`

Get human-readable error message from status.

#### `detectLabelWidth(status: PrinterStatus): LabelWidth | null`

Automatically detect label format from printer status.

```typescript
const labelWidth = detectLabelWidth(status);
// Returns: '62-mm-wide continuous', '29x90-mm-die-cut', etc.
```

### Logging Functions

#### `enableLogging(enabled: boolean): void`

Enable or disable debug logging.

```typescript
enableLogging(true);  // Show detailed debug logs
enableLogging(false); // Silent mode (errors/warnings still shown)
```

#### `isLoggingEnabled(): boolean`

Check if logging is currently enabled.

## Getting Printer Information

First, you'll need the **VendorID (VID)** and **ProductID (PID)** of your printer:

1. Download and use the [Zadig](http://sourceforge.net/projects/libwdi/files/zadig/) tool to identify the PID and VID
2. Common Brother printer IDs:
   - Vendor ID: `0x04f9` (Brother)
   - Product IDs vary by model (e.g., `0x209d`, `0x2015`, etc.)

## Image Requirements

- **Format**: PNG only
- **Size**: Any - images are automatically resized to fit your label!
  - Images too large are scaled down to fit
  - Images too small are centered on the label
  - Aspect ratio is always preserved
- **Color**: Any (will be converted to black & white)

Download a [sample PNG file](https://github.com/yiqun12/node-brother-label-printer/blob/main/sample.png) to test with.

## Example
<!-- Images placed side by side -->
<p>
  <img src="https://imagedelivery.net/D2Yu9GcuKDLfOUNdrm2hHQ/3704e62e-efab-44df-a7fb-7be9627ae000/public" alt="Image 1" width="300" height="500" style="float: left; margin-right: 10%;"/>
  <img src="https://imagedelivery.net/D2Yu9GcuKDLfOUNdrm2hHQ/e1b38183-61a8-4026-7893-d11ae8280e00/public" alt="Image 2" width="300" height="500" style="float: left;"/>
</p>

[Youtube Demo Video](https://youtu.be/1JQClq5ZUD4)

[![Watch the video](https://img.youtube.com/vi/1JQClq5ZUD4/0.jpg)](https://www.youtube.com/watch?v=1JQClq5ZUD4)  



## Development

### Getting Started

```bash
# Clone the repository
git clone https://github.com/yiqun12/node-brother-label-printer.git
cd node-brother-label-printer

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build the project
npm run build

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Development mode (watch for changes)
npm run dev
```

### Project Structure

```
├── src/                          # TypeScript source files
│   ├── lib/                     # Core library modules
│   │   ├── calibration/         # Label calibration utilities
│   │   │   └── labelCalibration.ts
│   │   ├── config/              # Configuration loader
│   │   │   └── configLoader.ts
│   │   ├── image/               # Image processing
│   │   │   ├── compression.ts   # TIFF PackBits compression
│   │   │   ├── processing.ts    # Main image processing
│   │   │   └── utils.ts         # Image utilities
│   │   ├── printer/             # Printer communication
│   │   │   ├── detection.ts     # Printer detection
│   │   │   ├── printing.ts      # Printing operations
│   │   │   └── status.ts        # Status queries
│   │   └── utils/               # Utility functions
│   │       └── logger.ts        # Debug logging
│   ├── types/                   # TypeScript type definitions
│   │   ├── config.ts            # Configuration types
│   │   ├── core.ts              # Core types
│   │   ├── external.ts          # External library types
│   │   ├── index.ts             # Type exports
│   │   ├── label.ts             # Label types
│   │   └── printer.ts           # Printer types
│   ├── __tests__/               # Jest test files
│   ├── types.ts                 # Legacy type exports
│   └── index.ts                 # Main export file
├── config/                      # JSON configuration files
│   ├── labels/                  # Label specifications
│   │   ├── 29x90-mm-die-cut.json
│   │   ├── 38x90-mm-die-cut.json
│   │   └── 62-mm-wide-continuous.json
│   ├── printers/                # Printer specifications
│   │   └── QL-700.json
│   └── README.md                # Configuration guide
├── dist/                        # Compiled output (ESM + CJS)
├── samples/                     # Sample label images
├── scripts/                     # Build and utility scripts
└── .github/workflows/           # CI/CD workflows
```

### Build System

This project uses a sophisticated build system that generates both CommonJS and ES Module outputs:

- **ESM**: `dist/*.js` - ES Module format for modern environments
- **CJS**: `dist/*.cjs` - CommonJS format for Node.js compatibility  
- **Types**: `dist/*.d.ts` - TypeScript declarations for both formats

### Testing

Tests use Jest with TypeScript support:

```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Contributing

We welcome contributions! Please follow these steps:

1. Fork this repo
2. Clone your fork: `git clone <your-fork-url>`
3. Install dependencies: `npm install`  
4. Create a feature branch: `git checkout -b feature/amazing-feature`
5. Make your changes and add tests
6. Ensure all tests pass: `npm test`
7. Ensure the build works: `npm run build`
8. Commit your changes: `git commit -m 'Add amazing feature'`
9. Push to your branch: `git push origin feature/amazing-feature`
10. Open a Pull Request

### Code Quality

- Write TypeScript with full type safety
- Add tests for new features
- Follow the existing code style
- Update documentation as needed

## Support

If you enjoy this project and would like to support its development:

- ☕ [Buy me a coffee](https://buymeacoffee.com/yeequn12)
- 💸 Zelle: admin@eatifydash.com (Name: Yiqun Xu)
- 📧 Email: admin@eatifydash.com

## Contributors

Thanks to our contributors! 🎉👏

- [Yiqun Xu](https://github.com/yiqun12) - Original author
- [Yutao Li](https://github.com/Yutao-Li-306) - Contributor

## License

ISC - See [LICENSE](LICENSE) file for details.
