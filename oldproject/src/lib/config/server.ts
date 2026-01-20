/**
 * Server-only Configuration Manager
 * Handles private environment variables and server-specific configuration
 */

import { env as privateEnv } from '$env/dynamic/private';
import * as CONFIG from '../constants/config.constants';
import { TimeoutConfig, envConfig } from './index';

/**
 * Server-side environment variable accessor
 */
class ServerEnvironmentConfig {
	private static instance: ServerEnvironmentConfig;

	private constructor() {}

	static getInstance(): ServerEnvironmentConfig {
		if (!ServerEnvironmentConfig.instance) {
			ServerEnvironmentConfig.instance = new ServerEnvironmentConfig();
		}
		return ServerEnvironmentConfig.instance;
	}

	/**
	 * Get private environment variable with fallback
	 */
	getPrivate(key: string, fallback?: string): string | undefined {
		return privateEnv[key] || fallback;
	}

	/**
	 * Get required private environment variable (throws if missing)
	 */
	getRequiredPrivate(key: string): string {
		const value = privateEnv[key];
		if (!value) {
			throw new Error(`Required private environment variable ${key} is not set`);
		}
		return value;
	}

	/**
	 * Get numeric environment variable with validation
	 */
	getNumber(key: string, fallback?: number): number {
		const value = this.getPrivate(key);
		if (!value && fallback !== undefined) return fallback;
		if (!value) return 0;

		const parsed = parseInt(value, 10);
		if (isNaN(parsed)) {
			throw new Error(`Environment variable ${key} must be a valid number: ${value}`);
		}
		return parsed;
	}

	/**
	 * Get boolean environment variable
	 */
	getBoolean(key: string, fallback = false): boolean {
		const value = this.getPrivate(key);
		if (!value) return fallback;
		return value.toLowerCase() === 'true' || value === '1';
	}

	/**
	 * Validate URL format
	 */
	getValidatedUrl(key: string, fallback?: string): string {
		const value = this.getPrivate(key, fallback);
		if (value && !this.isValidUrl(value)) {
			throw new Error(`Environment variable ${key} must be a valid URL: ${value}`);
		}
		return value || '';
	}

	private isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Server-specific service configuration factory
 */
export class ServerServiceConfig {
	private serverEnv: ServerEnvironmentConfig;

	constructor() {
		this.serverEnv = ServerEnvironmentConfig.getInstance();
	}

	/**
	 * Get AVNU server configuration (with private env access)
	 */
	getAvnuServerConfig() {
		return {
			API_BASE_URL: envConfig.getValidatedUrl(
				'PUBLIC_AVNU_API_URL',
				'https://starknet.paymaster.avnu.fi'
			),
			API_KEY: this.serverEnv.getPrivate('AVNU_API_KEY')
		};
	}

	/**
	 * Get database configuration
	 */
	getDatabaseConfig() {
		return {
			URL: this.serverEnv.getRequiredPrivate('DATABASE_URL'),
			TIMEOUT: TimeoutConfig.DATABASE,
			MAX_CONNECTIONS: CONFIG.DATABASE.MAX_CONNECTIONS,
			RETRY_ATTEMPTS: CONFIG.DATABASE.RETRY_ATTEMPTS
		};
	}

	/**
	 * Get security configuration
	 */
	getSecurityConfig() {
		return {
			...CONFIG.SECURITY,
			SESSION_SECRET: this.serverEnv.getRequiredPrivate('SESSION_SECRET')
		};
	}

	/**
	 * Get Starknet configuration (server-side with private RPC URL)
	 */
	getStarknetConfig() {
		return {
			RPC_URL: this.serverEnv.getRequiredPrivate('STARKNET_RPC_URL'),
			CHAIN_ID: envConfig.getPublic('PUBLIC_STARKNET_CHAIN_ID', 'SN_MAIN'),
			SPEC_VERSION: envConfig.getPublic('PUBLIC_STARKNET_SPEC_VERSION', '0.9.0')
		};
	}

	/**
	 * Get monitoring configuration
	 */
	getMonitoringConfig() {
		return {
			...CONFIG.MONITORING,
			SENTRY_DSN: this.serverEnv.getValidatedUrl(
				'SENTRY_DSN',
				envConfig.getPublic('PUBLIC_SENTRY_DSN')
			),
			ENABLE_SENTRY: envConfig.getBoolean('PUBLIC_ENABLE_SENTRY', true)
		};
	}
}

/**
 * Server-side private environment variables
 */
export const ServerPrivateEnv = {
	// Database Configuration
	DATABASE_URL: () => ServerEnvironmentConfig.getInstance().getRequiredPrivate('DATABASE_URL'),

	// Security Secrets
	SESSION_SECRET: () => ServerEnvironmentConfig.getInstance().getRequiredPrivate('SESSION_SECRET'),

	// Starknet Configuration
	STARKNET_RPC_URL: () =>
		ServerEnvironmentConfig.getInstance().getRequiredPrivate('STARKNET_RPC_URL'),

	// Starknet WebSocket RPC (private, for server-side subscriptions)
	STARKNET_RPC_WSS: () =>
		ServerEnvironmentConfig.getInstance().getRequiredPrivate('STARKNET_RPC_WSS'),

	// API Keys
	AVNU_API_KEY: () => ServerEnvironmentConfig.getInstance().getPrivate('AVNU_API_KEY'),
	SENTRY_DSN_PRIVATE: () => ServerEnvironmentConfig.getInstance().getPrivate('SENTRY_DSN'),

	// Service Configuration
	PORT: () => ServerEnvironmentConfig.getInstance().getNumber('PORT', 3000),

	// Lightning/Atomiq Configuration
	ATOMIQ_API_KEY: () => ServerEnvironmentConfig.getInstance().getPrivate('ATOMIQ_API_KEY'),
	BITCOIN_RPC_URL: () => ServerEnvironmentConfig.getInstance().getValidatedUrl('BITCOIN_RPC_URL'),

	// Custom getter for any private env var
	get: (key: string, fallback?: string) =>
		ServerEnvironmentConfig.getInstance().getPrivate(key, fallback),
	getRequired: (key: string) => ServerEnvironmentConfig.getInstance().getRequiredPrivate(key),
	getNumber: (key: string, fallback?: number) =>
		ServerEnvironmentConfig.getInstance().getNumber(key, fallback),
	getBoolean: (key: string, fallback = false) =>
		ServerEnvironmentConfig.getInstance().getBoolean(key, fallback),
	getUrl: (key: string, fallback?: string) =>
		ServerEnvironmentConfig.getInstance().getValidatedUrl(key, fallback)
} as const;

// Export singleton instances
export const serverEnvConfig = ServerEnvironmentConfig.getInstance();
export const serverServiceConfig = new ServerServiceConfig();

/**
 * Server-side environment validation helpers
 */
export const ServerEnvValidation = {
	/**
	 * Validate that all required private environment variables are set for production
	 */
	validateProduction(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		try {
			ServerPrivateEnv.DATABASE_URL();
			ServerPrivateEnv.SESSION_SECRET();
		} catch (error) {
			errors.push(error instanceof Error ? error.message : 'Unknown validation error');
		}

		return { valid: errors.length === 0, errors };
	},

	/**
	 * Validate that all required URLs are properly formatted
	 */
	validateUrls(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		const urlVars = [
			{ name: 'DATABASE_URL', getter: ServerPrivateEnv.DATABASE_URL },
			{ name: 'BITCOIN_RPC_URL', getter: ServerPrivateEnv.BITCOIN_RPC_URL }
		];

		for (const { name, getter } of urlVars) {
			try {
				const url = getter();
				if (url && !isValidUrl(url)) {
					errors.push(`Invalid URL format for ${name}: ${url}`);
				}
			} catch (error) {
				// Skip validation if the variable is not set (optional)
				if (!error.message.includes('not set')) {
					errors.push(
						`URL validation failed for ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			}
		}

		return { valid: errors.length === 0, errors };
	},

	/**
	 * Validate all server-side configuration
	 */
	validateAll(): { valid: boolean; errors: string[] } {
		const productionValidation = this.validateProduction();
		const urlValidation = this.validateUrls();

		const errors = [...productionValidation.errors, ...urlValidation.errors];

		return { valid: errors.length === 0, errors };
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
