# Brother QL Printer Configuration System

This directory contains configuration files for the Brother QL label printer library. The configuration system replaces hardcoded values with flexible, maintainable JSON files.

## Directory Structure

```
config/
├── labels/          # Label specifications and calibrations
├── printers/        # Printer model capabilities and settings  
└── README.md        # This file
```

## Label Configuration Files

Each label type has its own JSON file in `labels/` with the following structure:

```json
{
  "name": "29x90-mm-die-cut",
  "displayName": "29mm x 90mm Die-Cut Label",
  "type": "die-cut",
  "widthMm": 29,
  "lengthMm": 90,
  "calibration": {
    "leftOffsetAdjustment": 0,
    "topOffsetAdjustment": -8,
    "lengthAdjustmentMm": -2.5,
    "specialLeftOffset": 250,
    "bypassStandardCalculation": true
  },
  "processingGroup": "special",
  "requiresSpecialHandling": true,
  "specialHandlingNotes": "Special handling notes here"
}
```

### Calibration Parameters

- `leftOffsetAdjustment`: Horizontal positioning adjustment in pixels (positive = right, negative = left)
- `topOffsetAdjustment`: Vertical positioning adjustment in pixels (positive = down, negative = up)
- `lengthAdjustmentMm`: **Die-cut labels only** - Adjusts the number of raster lines sent to prevent cutting overshoots (negative = send fewer lines to cut shorter, positive = send more lines). Does NOT change the declared label size (which must match the physical tape).
- `specialLeftOffset`: Override value for special positioning cases
- `bypassStandardCalculation`: Whether to bypass standard margin calculations

### Processing Groups

Labels are organized into processing groups for consistent handling:
- `narrow`: Labels ≤ 29mm wide (special centering logic)
- `standard`: Standard labels 30-62mm wide
- `wide`: Labels > 62mm wide (requires QL-1050/1060N)
- `special`: Labels requiring unique handling (e.g., 29mm labels)

## Printer Configuration Files

Each printer model has a JSON file in `printers/` with:

```json
{
  "model": "QL-700",
  "productId": "0x2042",
  "vendorId": "0x04F9",
  "capabilities": {
    "supportsCompression": false,
    "supportsHighResolution": true,
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

## Adding New Labels

1. Create a new JSON file in `labels/` with the label specifications
2. Set appropriate calibration values (start with null if unknown)
3. Assign to the correct processing group
4. Test and adjust calibration values as needed

## Adding New Printers

1. Create a new JSON file in `printers/` with the printer model name
2. Set the USB product ID and capabilities
3. Specify initialization requirements
4. List supported label groups based on maxWidthMm

## Testing Calibrations

To test and adjust calibrations:

1. Edit the JSON file for your label type
2. Run the test script: `pnpm build && node test-label-printing.js`
3. Check the printed output for:
   - Horizontal centering
   - Vertical positioning
   - Cut length accuracy
4. Adjust calibration values and repeat

### Calibration Guidelines

- Start with small adjustments (±5 pixels, ±1mm)
- For horizontal issues:
  - Image too far left: Increase leftOffsetAdjustment
  - Image too far right: Decrease leftOffsetAdjustment
- For vertical issues:
  - Too much top padding: Use negative topOffsetAdjustment
  - Image too high: Use positive topOffsetAdjustment
- For cut length (die-cut labels only):
  - **Cutting into next label (overshooting)**: Use negative lengthAdjustmentMm (e.g., -2 to reduce feed by 2mm)
  - **Cut too short (not reaching perforation)**: Use positive lengthAdjustmentMm
  - **Note**: This adjusts the actual print data sent, not the declared label size, to avoid media mismatch errors

## Configuration Cache

The configuration system uses a 1-minute cache during development to avoid repeated file I/O. In production, you may want to increase this or load configs once at startup.