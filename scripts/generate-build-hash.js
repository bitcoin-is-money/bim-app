#!/usr/bin/env node

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Generate SHA256 hash of build directory for verifiable builds
 */

const BUILD_DIR = 'build';
const OUTPUT_FILE = 'build_hash.txt';

function getAllFiles(dir, fileList = []) {
	const files = readdirSync(dir);

	files.forEach((file) => {
		const fullPath = join(dir, file);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			getAllFiles(fullPath, fileList);
		} else {
			fileList.push(fullPath);
		}
	});

	return fileList;
}

function generateBuildHash() {
	try {
		const buildPath = resolve(BUILD_DIR);

		// Check if build directory exists
		try {
			statSync(buildPath);
		} catch (error) {
			console.error(`Build directory '${BUILD_DIR}' not found. Run 'npm run build' first.`);
			process.exit(1);
		}

		// Get all files in build directory
		const files = getAllFiles(buildPath);

		// Sort files for deterministic hashing
		files.sort();

		// Create hash of all files
		const hash = createHash('sha256');

		// Add metadata
		const metadata = {
			timestamp: new Date().toISOString(),
			buildDirectory: BUILD_DIR,
			fileCount: files.length,
			files: []
		};

		console.log(`Generating SHA256 hash for ${files.length} files in ${BUILD_DIR}/`);

		files.forEach((file) => {
			const relativePath = file.replace(buildPath + '/', '');
			const content = readFileSync(file);
			const stat = statSync(file);

			// Hash the file path and content
			hash.update(relativePath);
			hash.update(content);

			// Add file info to metadata
			metadata.files.push({
				path: relativePath,
				size: stat.size,
				modified: stat.mtime.toISOString()
			});
		});

		const buildHash = hash.digest('hex');

		// Generate output content
		const output = [
			'# Build Verification Hash',
			`Generated: ${metadata.timestamp}`,
			`Build Directory: ${metadata.buildDirectory}/`,
			`Files Processed: ${metadata.fileCount}`,
			'',
			`SHA256: ${buildHash}`,
			'',
			'# File Manifest',
			...metadata.files.map(
				(file) => `${file.path} (${file.size} bytes, modified: ${file.modified})`
			)
		].join('\n');

		// Write hash to file
		writeFileSync(OUTPUT_FILE, output);

		console.log(`✅ Build hash generated successfully!`);
		console.log(`📋 Hash: ${buildHash}`);
		console.log(`📄 Details saved to: ${OUTPUT_FILE}`);
	} catch (error) {
		console.error('Error generating build hash:', error.message);
		process.exit(1);
	}
}

generateBuildHash();
