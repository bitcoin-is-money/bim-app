/**
 * @fileoverview Atomiq Service Configuration Management
 *
 * This file handles configuration setup, validation, and default values
 * for the Atomiq cross-chain swap services.
 *
 * @author bim
 * @version 1.0.0
 */

import { env as privateEnv } from '$env/dynamic/private';
import { ServerPrivateEnv } from '$lib/config/server';
import type { AtomiqConfig } from './types';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
	timeout: 300000, // 5 minutes for Lightning payments
	retries: 3,
	bitcoinNetwork: 'mainnet' as const
} as const;

/**
 * Creates and validates Atomiq service configuration
 */
export function createAtomiqConfig(overrides: Partial<AtomiqConfig> = {}): AtomiqConfig {
	// Parse intermediary URLs from environment if provided
	const envIntermediaryUrls = privateEnv.ATOMIQ_INTERMEDIARY_URLS
		? privateEnv.ATOMIQ_INTERMEDIARY_URLS.split(',').map((url) => url.trim())
		: undefined;

	const config: AtomiqConfig = {
		...DEFAULT_CONFIG,
		...overrides,
		// Always use environment variables for these critical settings
		starknetRpcUrl: ServerPrivateEnv.STARKNET_RPC_URL(),
		bitcoinNetwork:
			(privateEnv.BITCOIN_NETWORK as 'mainnet' | 'testnet') || DEFAULT_CONFIG.bitcoinNetwork,
		webhookUrl: privateEnv.ATOMIQ_WEBHOOK_URL,
		intermediaryUrls: envIntermediaryUrls || []
	};

	// Validate required configuration
	validateConfig(config);

	return config;
}

/**
 * Validates the configuration for required fields and sensible values
 */
function validateConfig(config: AtomiqConfig): void {
	if (!config.starknetRpcUrl) {
		throw new Error('STARKNET_RPC_URL is required for Atomiq service');
	}

	if (!['mainnet', 'testnet'].includes(config.bitcoinNetwork)) {
		throw new Error(
			`Invalid Bitcoin network: ${config.bitcoinNetwork}. Must be 'mainnet' or 'testnet'`
		);
	}

	if (config.timeout && (config.timeout < 10000 || config.timeout > 600000)) {
		throw new Error('Timeout must be between 10 seconds and 10 minutes');
	}

	if (config.retries && (config.retries < 0 || config.retries > 10)) {
		throw new Error('Retries must be between 0 and 10');
	}

	if (config.intermediaryUrls) {
		for (const url of config.intermediaryUrls) {
			try {
				new URL(url);
			} catch {
				throw new Error(`Invalid intermediary URL: ${url}`);
			}
		}
	}
}

/**
 * Gets the singleton configuration instance
 */
let configInstance: AtomiqConfig | null = null;

export function getConfig(): AtomiqConfig {
	if (!configInstance) {
		configInstance = createAtomiqConfig();
	}
	return configInstance;
}

/**
 * Gets the primary intermediary URL with fallback logic
 */
export function getPrimaryIntermediaryUrl(config: AtomiqConfig): string | null {
	if (config.intermediaryUrls && config.intermediaryUrls.length > 0) {
		return config.intermediaryUrls[0];
	}
	return null;
}

/**
 * Resets the configuration (mainly for testing)
 */
export function resetConfig(): void {
	configInstance = null;
}
