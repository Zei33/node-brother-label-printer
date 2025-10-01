#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively fix CommonJS extensions in the dist-cjs directory
 * Changes .js imports to .cjs and renames output files to .cjs
 */
async function fixCjsExtensions() {
	const distCjsDir = path.join(__dirname, '..', 'dist-cjs');
	const distDir = path.join(__dirname, '..', 'dist');

	// First, process all .js files in dist-cjs
	await processDirectory(distCjsDir);
	
	// Then copy the processed files to dist with .cjs extensions
	await copyAndRename(distCjsDir, distDir);
	
	// Clean up dist-cjs directory
	await fs.rm(distCjsDir, { recursive: true, force: true });
}

async function processDirectory(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		
		if (entry.isDirectory()) {
			await processDirectory(fullPath);
		} else if (entry.name.endsWith('.js')) {
			await processJsFile(fullPath);
		}
	}
}

async function processJsFile(filePath) {
	try {
		let content = await fs.readFile(filePath, 'utf8');
		
		// Replace .js extensions in imports with .cjs
		content = content.replace(/from\s+['"]([^'"]*?)\.js['"]/g, 'from "$1.cjs"');
		content = content.replace(/import\s*\(\s*['"]([^'"]*?)\.js['"]\s*\)/g, 'import("$1.cjs")');
		content = content.replace(/require\s*\(\s*['"]([^'"]*?)\.js['"]\s*\)/g, 'require("$1.cjs")');
		
		await fs.writeFile(filePath, content, 'utf8');
	} catch (error) {
		console.error(`Error processing ${filePath}:`, error);
	}
}

async function copyAndRename(sourceDir, targetDir) {
	await ensureDirectoryExists(targetDir);
	const entries = await fs.readdir(sourceDir, { withFileTypes: true });
	
	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry.name);
		let targetPath = path.join(targetDir, entry.name);
		
		if (entry.isDirectory()) {
			await copyAndRename(sourcePath, targetPath);
		} else if (entry.name.endsWith('.js')) {
			// Rename .js to .cjs
			targetPath = targetPath.replace(/\.js$/, '.cjs');
			await fs.copyFile(sourcePath, targetPath);
		} else {
			// Copy other files as-is
			await fs.copyFile(sourcePath, targetPath);
		}
	}
}

async function ensureDirectoryExists(dir) {
	try {
		await fs.mkdir(dir, { recursive: true });
	} catch (error) {
		if (error.code !== 'EEXIST') {
			throw error;
		}
	}
}

// Run the script
fixCjsExtensions().catch(console.error);
