/**
 * Internal logging utility for the Brother Label Printer library.
 * 
 * Logs are disabled by default to avoid cluttering console output in production.
 * Users can enable logging in two ways:
 * 
 * 1. Environment variable: Set DEBUG=brother-printer or DEBUG=*
 * 2. Programmatic API: Call enableLogging(true)
 * 
 * @example
 * // Via environment variable (before running your script)
 * // DEBUG=brother-printer node your-script.js
 * 
 * @example
 * // Via API
 * import { enableLogging } from 'node-brother-label-printer';
 * enableLogging(true);
 */

let loggingEnabled = false;

// Check environment variable on module load
if (typeof process !== 'undefined' && process.env.DEBUG !== undefined) {
	const debugValue = process.env.DEBUG;
	if (debugValue === '*' || debugValue.includes('brother-printer') || debugValue.includes('brother')) {
		loggingEnabled = true;
	}
}

/**
 * Enable or disable debug logging for the library.
 * 
 * @param enabled - Whether to enable logging
 * @example
 * import { enableLogging } from 'node-brother-label-printer';
 * enableLogging(true);  // Enable logging
 * enableLogging(false); // Disable logging
 */
export function enableLogging(enabled: boolean): void {
	loggingEnabled = enabled;
}

/**
 * Check if logging is currently enabled.
 * 
 * @returns true if logging is enabled, false otherwise
 */
export function isLoggingEnabled(): boolean {
	return loggingEnabled;
}

/**
 * Internal logger instance with methods matching console API.
 * 
 * - log, info, debug: Only shown when logging is enabled
 * - warn, error: Always shown (critical information that should never be hidden)
 */
export const logger = {
	log: (...args: unknown[]): void => {
		if (loggingEnabled) {
			console.log(...args);
		}
	},
	
	info: (...args: unknown[]): void => {
		if (loggingEnabled) {
			console.info(...args);
		}
	},
	
	warn: (...args: unknown[]): void => {
		// Warnings are always shown
		console.warn(...args);
	},
	
	error: (...args: unknown[]): void => {
		// Errors are always shown
		console.error(...args);
	},
	
	debug: (...args: unknown[]): void => {
		if (loggingEnabled) {
			console.log(...args);
		}
	}
};

