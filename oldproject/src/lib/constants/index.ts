/**
 * Constants Barrel File
 * Centralized exports for all application constants
 */

// Re-export all constants from category files
export * from './api.constants';
export * from './blockchain.constants';
export * from './ui.constants';
export * from './config.constants';

// Type definitions for constants
export type SupportedAsset = (typeof import('./blockchain.constants').SUPPORTED_ASSETS)[number];
export type Environment =
	(typeof import('./config.constants').ENVIRONMENT)[keyof typeof import('./config.constants').ENVIRONMENT];
export type LogLevel =
	(typeof import('./config.constants').LOGGING.LEVELS)[keyof typeof import('./config.constants').LOGGING.LEVELS];
export type NetworkName = keyof typeof import('./blockchain.constants').NETWORKS;

/**
 * Validation functions for critical constants
 */
export const ConstantsValidator = {
	/**
	 * Validates that a string is a valid contract address
	 */
	isValidContractAddress: (address: string): boolean => {
		return /^0x[0-9a-fA-F]{64}$/.test(address);
	},

	/**
	 * Validates that a URL is properly formatted
	 */
	isValidUrl: (url: string): boolean => {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Validates that a timeout value is within reasonable bounds
	 */
	isValidTimeout: (timeout: number): boolean => {
		return timeout > 0 && timeout <= 600_000; // Max 10 minutes
	},

	/**
	 * Validates all contract addresses are properly formatted
	 */
	validateContractAddresses: (): { valid: boolean; errors: string[] } => {
		const { CONTRACT_CLASS_HASHES } = require('./blockchain.constants');
		const errors: string[] = [];

		for (const [name, address] of Object.entries(CONTRACT_CLASS_HASHES)) {
			if (!ConstantsValidator.isValidContractAddress(address as string)) {
				errors.push(`Invalid contract address for ${name}: ${address}`);
			}
		}

		return { valid: errors.length === 0, errors };
	},

	/**
	 * Validates all API endpoints are properly formatted URLs
	 */
	validateApiEndpoints: (): { valid: boolean; errors: string[] } => {
		const { API_ENDPOINTS } = require('./api.constants');
		const errors: string[] = [];

		for (const [name, url] of Object.entries(API_ENDPOINTS)) {
			if (!ConstantsValidator.isValidUrl(url as string)) {
				errors.push(`Invalid URL for ${name}: ${url}`);
			}
		}

		return { valid: errors.length === 0, errors };
	}
};
