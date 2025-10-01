/**
 * TIFF PackBits compression utilities for Brother QL printers.
 * 
 * This module implements the TIFF PackBits compression algorithm used by
 * Brother QL printers that support compression to reduce data transfer size.
 * 
 * @fileoverview TIFF PackBits compression implementation
 */

/**
 * Count consecutive identical bytes starting at a given position.
 * 
 * @param buffer - Buffer to analyze
 * @param i - Starting position in the buffer
 * @returns Number of consecutive identical bytes (maximum 128)
 */
function countRunLength(buffer: Buffer, i: number): number {
	const startByte = buffer[i];
	let runLength = 1;
	
	while (i + runLength < buffer.length &&
		buffer[i + runLength] === startByte &&
		runLength < 128) {
		runLength++;
	}
	
	return runLength;
}

/**
 * Process a run of repeated bytes for TIFF PackBits compression.
 * 
 * Creates a compressed representation of repeated bytes using the PackBits
 * format: count byte followed by the repeated value.
 * 
 * @param buffer - Source buffer containing the repeated bytes
 * @param i - Starting position of the repeated sequence
 * @param runLength - Number of repeated bytes
 * @returns Object containing the compressed result buffer and next processing index
 */
function processRepeatedBytes(buffer: Buffer, i: number, runLength: number): { result: Buffer; nextIndex: number } {
	const startByte = buffer[i];
	const count = 257 - runLength; // Convert to negative representation
	return {
		result: Buffer.from([count, startByte]),
		nextIndex: i + runLength
	};
}

/**
 * Process a sequence of non-repeating bytes for TIFF PackBits compression.
 * 
 * Creates an uncompressed representation using PackBits format: count byte
 * followed by the literal data bytes.
 * 
 * @param buffer - Source buffer containing the non-repeating bytes
 * @param startPos - Starting position of the sequence
 * @returns Object containing array of result buffers and next processing index
 */
function processNonRepeatingBytes(buffer: Buffer, startPos: number): { result: Buffer[]; nextIndex: number } {
	let i = startPos;
	while (i < buffer.length && i - startPos < 128) {
		if (i + 1 < buffer.length && buffer[i] === buffer[i + 1]) {
			break; // Stop at repeated byte
		}
		i++;
	}

	const length = i - startPos;
	const countByte = length - 1; // Zero-based count
	const dataBytes = buffer.subarray(startPos, i);
	return {
		result: [Buffer.from([countByte]), dataBytes],
		nextIndex: i
	};
}

/**
 * Compress data using the TIFF PackBits algorithm.
 * 
 * This compression method is used by Brother QL printers that support compression
 * to reduce the amount of data transferred over USB. The algorithm encodes runs
 * of identical bytes efficiently while preserving non-repeating sequences.
 * 
 * @param buffer - Raw raster line data to compress
 * @returns Compressed buffer using TIFF PackBits format
 */
export function compressTIFF(buffer: Buffer): Buffer {
	const result: Buffer[] = [];
	let i = 0;

	while (i < buffer.length) {
		const runLength = countRunLength(buffer, i);

		if (runLength > 1) {
			const processed = processRepeatedBytes(buffer, i, runLength);
			result.push(processed.result);
			i = processed.nextIndex;
		} else {
			const processed = processNonRepeatingBytes(buffer, i);
			result.push(...processed.result);
			i = processed.nextIndex;
		}
	}

	return Buffer.concat(result);
}
