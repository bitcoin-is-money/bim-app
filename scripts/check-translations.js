#!/usr/bin/env node

/**
 * Translation Check Script
 *
 * This script checks for missing translations in the codebase by:
 * 1. Extracting all translation keys from locale files
 * 2. Finding all $t() calls in source files
 * 3. Identifying missing translation keys
 * 4. Detecting potential hardcoded text
 *
 * Usage: node scripts/check-translations.js
 */

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';

// Configuration
const LOCALE_DIR = 'src/lib/i18n/locales';
const SOURCE_DIRS = ['src/**/*.svelte', 'src/**/*.ts', 'src/**/*.js'];
const EXCLUDED_PATTERNS = ['node_modules/**', 'dist/**', 'build/**', '.svelte-kit/**'];

// Colors for console output
const colors = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	reset: '\x1b[0m',
	bold: '\x1b[1m'
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
	log(`❌ ${message}`, 'red');
}

function logSuccess(message) {
	log(`✅ ${message}`, 'green');
}

function logWarning(message) {
	log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
	log(`ℹ️  ${message}`, 'blue');
}

/**
 * Recursively extract all translation keys from a JSON object
 */
function extractKeys(obj, prefix = '') {
	const keys = [];

	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;

		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			keys.push(...extractKeys(value, fullKey));
		} else {
			keys.push(fullKey);
		}
	}

	return keys;
}

/**
 * Load and parse all locale files
 */
function loadLocaleFiles() {
	const locales = {};
	const allKeys = new Set();

	try {
		// Find all locale directories
		const localeDirs = fs.readdirSync(LOCALE_DIR);

		for (const localeDir of localeDirs) {
			const localePath = path.join(LOCALE_DIR, localeDir);
			const localeStats = fs.statSync(localePath);

			if (localeStats.isDirectory()) {
				const locale = localeDir;
				locales[locale] = {};

				// Find all JSON files in this locale directory
				const jsonFiles = glob.sync(path.join(localePath, '*.json'));

				for (const jsonFile of jsonFiles) {
					try {
						const content = fs.readFileSync(jsonFile, 'utf8');
						const data = JSON.parse(content);

						// Extract keys from this file with the filename as prefix
						const fileName = path.basename(jsonFile, '.json');
						const keys = extractKeys(data, fileName);
						keys.forEach((key) => allKeys.add(key));

						// Store the data for this locale
						locales[locale][fileName] = data;

						logInfo(`Loaded ${keys.length} keys from ${locale}/${fileName}.json`);
					} catch (error) {
						logError(`Failed to parse ${jsonFile}: ${error.message}`);
					}
				}
			}
		}

		logSuccess(`Found ${allKeys.size} unique translation keys across all locales`);
		return { locales, allKeys: Array.from(allKeys) };
	} catch (error) {
		logError(`Failed to load locale files: ${error.message}`);
		return { locales: {}, allKeys: [] };
	}
}

/**
 * Find all $t() calls in source files
 */
function findTranslationCalls() {
	const translationCalls = new Set();
	const sourceFiles = [];

	try {
		// Find all source files
		for (const pattern of SOURCE_DIRS) {
			const files = glob.sync(pattern, { ignore: EXCLUDED_PATTERNS });
			sourceFiles.push(...files);
		}

		logInfo(`Scanning ${sourceFiles.length} source files for translation calls...`);

		for (const file of sourceFiles) {
			try {
				const content = fs.readFileSync(file, 'utf8');

				// Find $t() calls with regex
				const tCallRegex = /\$t\(['"`]([^'"`]+)['"`]\)/g;
				let match;

				while ((match = tCallRegex.exec(content)) !== null) {
					const key = match[1];
					translationCalls.add(key);
				}

				// Also look for potential hardcoded text patterns
				const hardcodedTextRegex = /["'`]([A-Z][a-z].*[a-z])["'`]/g;
				const hardcodedMatches = [];

				while ((match = hardcodedTextRegex.exec(content)) !== null) {
					const text = match[1];
					// Filter out common false positives
					if (
						text.length > 3 &&
						!text.includes('http') &&
						!text.includes('import') &&
						!text.includes('from') &&
						!text.includes('console') &&
						!text.includes('alt=') &&
						!text.includes('title=') &&
						!text.includes('aria-label=')
					) {
						hardcodedMatches.push({
							text,
							line: content.substring(0, match.index).split('\n').length
						});
					}
				}

				if (hardcodedMatches.length > 0) {
					logWarning(`Potential hardcoded text in ${file}:`);
					hardcodedMatches.forEach(({ text, line }) => {
						logWarning(`  Line ${line}: "${text}"`);
					});
				}
			} catch (error) {
				logError(`Failed to read ${file}: ${error.message}`);
			}
		}

		logSuccess(`Found ${translationCalls.size} translation calls`);
		return Array.from(translationCalls);
	} catch (error) {
		logError(`Failed to scan source files: ${error.message}`);
		return [];
	}
}

/**
 * Check for missing translation keys
 */
function checkMissingKeys(existingKeys, usedKeys) {
	const missingKeys = [];

	for (const usedKey of usedKeys) {
		// Check if the key exists directly
		if (existingKeys.includes(usedKey)) {
			continue;
		}

		// Check if the key exists with any filename prefix
		const hasPrefix = existingKeys.some((existingKey) => {
			// Split both keys by dots
			const usedParts = usedKey.split('.');
			const existingParts = existingKey.split('.');

			// Check if the existing key ends with the used key
			if (existingParts.length < usedParts.length) {
				return false;
			}

			// Check if the last parts match the used key
			const suffix = existingParts.slice(-usedParts.length).join('.');
			return suffix === usedKey;
		});

		if (!hasPrefix) {
			missingKeys.push(usedKey);
		}
	}

	if (missingKeys.length > 0) {
		logError(`Found ${missingKeys.length} missing translation keys:`);
		missingKeys.forEach((key) => {
			logError(`  - ${key}`);
		});
		return false;
	}

	logSuccess('All translation keys are properly defined!');
	return true;
}

/**
 * Check for missing locales
 */
function checkMissingLocales(locales, usedKeys) {
	const localeNames = Object.keys(locales);
	const missingLocales = {};

	for (const key of usedKeys) {
		for (const locale of localeNames) {
			if (!hasKeyInLocale(locales[locale], key)) {
				if (!missingLocales[locale]) {
					missingLocales[locale] = [];
				}
				missingLocales[locale].push(key);
			}
		}
	}

	let hasIssues = false;

	for (const [locale, keys] of Object.entries(missingLocales)) {
		if (keys.length > 0) {
			logError(`Locale '${locale}' is missing ${keys.length} translation keys:`);
			keys.forEach((key) => {
				logError(`  - ${key}`);
			});
			hasIssues = true;
		}
	}

	if (!hasIssues) {
		logSuccess('All locales have complete translation coverage!');
	}

	return !hasIssues;
}

/**
 * Check if a key exists in a locale object
 */
function hasKeyInLocale(localeObj, key) {
	// Search across all JSON files in this locale
	for (const [fileName, fileData] of Object.entries(localeObj)) {
		// Check if this key starts with the filename prefix
		if (key.startsWith(fileName + '.')) {
			// Remove the filename prefix and search in this file
			const keyWithoutPrefix = key.substring(fileName.length + 1);
			const keys = keyWithoutPrefix.split('.');
			let current = fileData;
			let found = true;

			for (const k of keys) {
				if (current && typeof current === 'object' && k in current) {
					current = current[k];
				} else {
					found = false;
					break;
				}
			}

			// If we found the complete key path, return true
			if (found && current !== undefined) {
				return true;
			}
		} else {
			// Key doesn't have filename prefix, search directly in this file
			const keys = key.split('.');
			let current = fileData;
			let found = true;

			for (const k of keys) {
				if (current && typeof current === 'object' && k in current) {
					current = current[k];
				} else {
					found = false;
					break;
				}
			}

			// If we found the complete key path, return true
			if (found && current !== undefined) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Main function
 */
function main() {
	log('🔍 Translation Check Starting...', 'bold');
	log('=====================================', 'bold');

	// Load locale files
	const { locales, allKeys } = loadLocaleFiles();

	if (allKeys.length === 0) {
		logError('No translation keys found. Check your locale file structure.');
		process.exit(1);
	}

	// Find translation calls
	const usedKeys = findTranslationCalls();

	if (usedKeys.length === 0) {
		logWarning('No translation calls found. This might indicate untranslated text.');
	}

	// Check for missing keys
	const keysComplete = checkMissingKeys(allKeys, usedKeys);

	// Check for missing locales
	const localesComplete = checkMissingLocales(locales, usedKeys);

	// Debug: Log the structure of locales and usedKeys
	logInfo('Debug: Locales structure:');
	Object.keys(locales).forEach((locale) => {
		logInfo(`  ${locale}: ${Object.keys(locales[locale]).join(', ')}`);
	});

	logInfo('Debug: Used keys:');
	usedKeys.slice(0, 10).forEach((key) => logInfo(`  ${key}`));
	if (usedKeys.length > 10) logInfo(`  ... and ${usedKeys.length - 10} more`);

	// Debug: Show some keys from allKeys
	logInfo('Debug: Sample keys from allKeys:');
	allKeys.slice(0, 10).forEach((key) => logInfo(`  ${key}`));
	if (allKeys.length > 10) logInfo(`  ... and ${allKeys.length - 10} more`);

	log('=====================================', 'bold');

	if (keysComplete && localesComplete) {
		log('🎉 Translation check passed!', 'green');
		process.exit(0);
	} else {
		log('🚫 Translation check failed!', 'red');
		log('');
		log('📋 To fix these issues:', 'yellow');
		log('1. Add missing translation keys to locale files', 'yellow');
		log('2. Ensure all locales have complete coverage', 'yellow');
		log('3. Replace hardcoded text with $t() calls', 'yellow');
		log('');
		log('🔧 Example locale file structure:', 'cyan');
		log('   {', 'cyan');
		log('     "welcome": {', 'cyan');
		log('       "title": "Welcome",', 'cyan');
		log('       "subtitle": "Welcome to our app"', 'cyan');
		log('     }', 'cyan');
		log('   }', 'cyan');
		process.exit(1);
	}
}

// Run the script
main();
