/**
 * Environment Variable Utilities
 * Simplified interface for accessing and validating environment variables
 */

import { envConfig } from './index';

/**
 * Public environment variables (client-safe)
 */
export const PublicEnv = {
	// Starknet Configuration (restricted client access - use ServerPrivateEnv.STARKNET_RPC_URL() for server-side)
	STARKNET_RPC_URL: () => {
		throw new Error(
			'Direct RPC URL access not allowed. Use ClientRpcProxyService for secure RPC access through server proxy endpoints, ' +
				'or ServerPrivateEnv.STARKNET_RPC_URL() for server-side access.'
		);
	},

	// DEPRECATED: Client-side RPC access removed for security
	// Use ClientRpcProxyService for secure server-side RPC access
	STARKNET_RPC_URL_FOR_SIGNING: () => {
		throw new Error(
			'STARKNET_RPC_URL_FOR_SIGNING is deprecated. Use ClientRpcProxyService for secure RPC access through server proxy endpoints.'
		);
	},
	STARKNET_CHAIN_ID: () => envConfig.getPublic('PUBLIC_STARKNET_CHAIN_ID', 'SN_MAIN'),
	STARKNET_SPEC_VERSION: () => envConfig.getPublic('PUBLIC_STARKNET_SPEC_VERSION', '0.9.0'),

	// WebAuthn Configuration
	WEBAUTHN_RP_ID: () => envConfig.getRequiredPublic('PUBLIC_WEBAUTHN_RP_ID'),
	WEBAUTHN_RP_NAME: () => envConfig.getPublic('PUBLIC_WEBAUTHN_RP_NAME', 'BIM3 WebAuthn Wallet'),
	BIM_ARGENT_050_ACCOUNT_CLASS_HASH: () =>
		envConfig.getPublic('PUBLIC_BIM_ARGENT_050_ACCOUNT_CLASS_HASH') ||
		'0x04bc5b0950521985d3f8db954fc6ae3832122c6ee4cd770efdbf87437699ce48',

	// Third-party Services
	AVNU_API_URL: () =>
		envConfig.getValidatedUrl('PUBLIC_AVNU_API_URL', 'https://starknet.paymaster.avnu.fi'),

	// Lightning/Bitcoin Configuration
	BITCOIN_NETWORK: () => envConfig.getPublic('PUBLIC_BITCOIN_NETWORK', 'testnet'),

	// Feature Flags
	ENABLE_ANALYTICS: () => envConfig.getBoolean('PUBLIC_ENABLE_ANALYTICS', false),
	ENABLE_DEBUG_MODE: () => envConfig.getBoolean('PUBLIC_ENABLE_DEBUG_MODE', false),

	// Development/Build Configuration
	NODE_ENV: () => envConfig.getPublic('PUBLIC_NODE_ENV', 'development'),
	BUILD_TIMESTAMP: () => envConfig.getPublic('PUBLIC_BUILD_TIMESTAMP', Date.now().toString()),

	// Custom getter for any public env var
	get: (key: string, fallback?: string) => envConfig.getPublic(key, fallback),
	getRequired: (key: string) => envConfig.getRequiredPublic(key),
	getNumber: (key: string, fallback?: number) => envConfig.getNumber(key, fallback),
	getBoolean: (key: string, fallback = false) => envConfig.getBoolean(key, fallback),
	getUrl: (key: string, fallback?: string) => envConfig.getValidatedUrl(key, fallback)
} as const;

/**
 * Private environment variables (server-side only)
 */
/**
 * DEPRECATED: Secure helper function for transaction signing services to access RPC URL
 * This function has been removed for security reasons.
 * Use ClientRpcProxyService for secure server-side RPC access.
 * @deprecated Use ClientRpcProxyService instead
 * @returns Never - always throws an error
 */
export function getStarknetRpcUrlForSigning(): never {
	throw new Error(
		'getStarknetRpcUrlForSigning is deprecated. Use ClientRpcProxyService for secure RPC access through server proxy endpoints.'
	);
}

export const PrivateEnv = {
	// Database Configuration
	DATABASE_URL: () => envConfig.getRequiredPrivate('DATABASE_URL'),

	// Security Secrets
	SESSION_SECRET: () => envConfig.getRequiredPrivate('SESSION_SECRET'),

	// Starknet Configuration (use ServerPrivateEnv.STARKNET_RPC_URL() instead)
	STARKNET_RPC_URL: () => {
		throw new Error(
			'Use ServerPrivateEnv.STARKNET_RPC_URL() from $lib/config/server for server-side access'
		);
	},

	// API Keys
	AVNU_API_KEY: () => envConfig.getPrivate('AVNU_API_KEY'),
	SENTRY_DSN_PRIVATE: () => envConfig.getPrivate('SENTRY_DSN'),

	// Service Configuration
	PORT: () => envConfig.getNumber('PORT', 3000),

	// Lightning/Atomiq Configuration
	ATOMIQ_API_KEY: () => envConfig.getPrivate('ATOMIQ_API_KEY'),
	BITCOIN_RPC_URL: () => envConfig.getValidatedUrl('BITCOIN_RPC_URL'),

	// Custom getter for any private env var
	get: (key: string, fallback?: string) => envConfig.getPrivate(key, fallback),
	getRequired: (key: string) => envConfig.getRequiredPrivate(key),
	getNumber: (key: string, fallback?: number) => envConfig.getNumber(key, fallback),
	getBoolean: (key: string, fallback = false) => envConfig.getBoolean(key, fallback),
	getUrl: (key: string, fallback?: string) => envConfig.getValidatedUrl(key, fallback)
} as const;

/**
 * Environment validation helpers
 */
export const EnvValidation = {
	/**
	 * Validate that all required environment variables are set for production
	 * Note: This validation only checks public variables. For private variables,
	 * use ServerEnvValidation from './server.js' on the server-side.
	 */
	validateProduction(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		// Only validate public environment variables here
		// Private environment variables should be validated server-side
		const requiredPublicVars = ['PUBLIC_WEBAUTHN_RP_ID'];

		for (const varName of requiredPublicVars) {
			// Use envConfig to access public env in a client-safe way
			const value = envConfig.getPublic(varName);
			if (!value) {
				errors.push(`Required public environment variable ${varName} is not set`);
			}
		}

		return { valid: errors.length === 0, errors };
	},

	/**
	 * Validate that all URLs are properly formatted
	 */
	validateUrls(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		const urlVars = [{ name: 'PUBLIC_AVNU_API_URL', getter: PublicEnv.AVNU_API_URL }];

		for (const { name, getter } of urlVars) {
			try {
				const url = getter();
				if (url && !isValidUrl(url)) {
					errors.push(`Invalid URL format for ${name}: ${url}`);
				}
			} catch (error) {
				errors.push(
					`URL validation failed for ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}

		return { valid: errors.length === 0, errors };
	},

	/**
	 * Get current environment name
	 */
	getEnvironment(): 'development' | 'staging' | 'production' {
		const nodeEnv = PublicEnv.NODE_ENV();
		if (nodeEnv === 'production') return 'production';
		if (nodeEnv === 'staging') return 'staging';
		return 'development';
	},

	/**
	 * Check if running in development mode
	 */
	isDevelopment(): boolean {
		return this.getEnvironment() === 'development';
	},

	/**
	 * Check if running in production mode
	 */
	isProduction(): boolean {
		return this.getEnvironment() === 'production';
	}
};

/**
 * Simple URL validation helper
 */
function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}
