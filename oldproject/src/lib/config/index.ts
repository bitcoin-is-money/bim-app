/**
 * Central Configuration Manager
 * Unified configuration system with typed access, validation, and environment handling
 */

import { browser, dev } from '$app/environment';
import { env } from '$env/dynamic/public';

// Import all existing constants
import * as API from '../constants/api.constants';
import * as BLOCKCHAIN from '../constants/blockchain.constants';
import * as CONFIG from '../constants/config.constants';
import { ConstantsValidator } from '../constants/index';
import * as UI from '../constants/ui.constants';

/**
 * Environment variable accessor with validation
 */
class EnvironmentConfig {
	private static instance: EnvironmentConfig;

	private constructor() {}

	static getInstance(): EnvironmentConfig {
		if (!EnvironmentConfig.instance) {
			EnvironmentConfig.instance = new EnvironmentConfig();
		}
		return EnvironmentConfig.instance;
	}

	/**
	 * Get public environment variable with fallback
	 */
	getPublic(key: string, fallback?: string): string | undefined {
		return (env && (env as any)[key]) || fallback;
	}

	/**
	 * Get private environment variable with fallback (server-side only)
	 * @deprecated Use ServerPrivateEnv from './server.js' for server-side private env access
	 */
	getPrivate(_key: string, fallback?: string): string | undefined {
		if (browser) {
			throw new Error(
				'Cannot access private environment variables in browser context. Use ServerPrivateEnv from ./server.js'
			);
		}
		// This method is deprecated to avoid client-side leaks
		console.warn(
			'getPrivate is deprecated. Use ServerPrivateEnv from ./server.js for server-side access'
		);
		return fallback;
	}

	/**
	 * Get required public environment variable (throws if missing)
	 */
	getRequiredPublic(key: string): string {
		const value = env && (env as any)[key];
		if (!value) {
			throw new Error(`Required public environment variable ${key} is not set`);
		}
		return value;
	}

	/**
	 * Get required private environment variable (throws if missing)
	 * @deprecated Use ServerPrivateEnv from './server.js' for server-side private env access
	 */
	getRequiredPrivate(_key: string): string {
		if (browser) {
			throw new Error(
				'Cannot access private environment variables in browser context. Use ServerPrivateEnv from ./server.js'
			);
		}
		throw new Error(
			`getRequiredPrivate is deprecated. Use ServerPrivateEnv from ./server.js for server-side access`
		);
	}

	/**
	 * Validate URL format for public environment variables
	 */
	getValidatedUrl(key: string, fallback?: string): string {
		const value = this.getPublic(key, fallback);
		if (value && !ConstantsValidator.isValidUrl(value)) {
			throw new Error(`Environment variable ${key} must be a valid URL: ${value}`);
		}
		return value || '';
	}

	/**
	 * Get numeric environment variable with validation (public only)
	 */
	getNumber(key: string, fallback?: number): number {
		const value = this.getPublic(key);
		if (!value && fallback !== undefined) return fallback;
		if (!value) return 0;

		const parsed = parseInt(value, 10);
		if (isNaN(parsed)) {
			throw new Error(`Environment variable ${key} must be a valid number: ${value}`);
		}
		return parsed;
	}

	/**
	 * Get boolean environment variable (public only)
	 */
	getBoolean(key: string, fallback = false): boolean {
		const value = this.getPublic(key);
		if (!value) return fallback;
		return value.toLowerCase() === 'true' || value === '1';
	}
}

/**
 * Unified timeout configuration
 */
export class TimeoutConfig {
	static readonly WEBAUTHN = {
		CREATE: API.TIMEOUTS.WEBAUTHN_CREATE,
		GET: API.TIMEOUTS.WEBAUTHN_GET
	} as const;

	static readonly API = {
		REQUEST: API.TIMEOUTS.API_REQUEST,
		POLLING_INTERVAL: API.TIMEOUTS.POLLING_INTERVAL,
		LONG_POLLING: API.TIMEOUTS.LONG_POLLING
	} as const;

	static readonly DATABASE = {
		CONNECTION: CONFIG.DATABASE.CONNECTION_TIMEOUT,
		QUERY: CONFIG.DATABASE.QUERY_TIMEOUT,
		IDLE: CONFIG.DATABASE.IDLE_TIMEOUT
	} as const;

	static readonly CIRCUIT_BREAKER = {
		TIMEOUT: API.TIMEOUTS.CIRCUIT_BREAKER_TIMEOUT,
		RECOVERY: API.CIRCUIT_BREAKER.RECOVERY_TIMEOUT
	} as const;

	static readonly SESSION = {
		MAX_AGE: CONFIG.SESSION.MAX_AGE,
		REFRESH_THRESHOLD: CONFIG.SESSION.REFRESH_THRESHOLD
	} as const;

	static readonly UPLOAD = {
		TIMEOUT: CONFIG.UPLOAD.UPLOAD_TIMEOUT
	} as const;

	/**
	 * Get timeout with environment override
	 */
	static getTimeout(category: string, key: string, fallback: number): number {
		const envKey = `TIMEOUT_${category.toUpperCase()}_${key.toUpperCase()}`;
		return EnvironmentConfig.getInstance().getNumber(envKey, fallback);
	}
}

/**
 * Service-specific configuration factory
 */
export class ServiceConfig {
	private env: EnvironmentConfig;

	constructor() {
		this.env = EnvironmentConfig.getInstance();
	}

	/**
	 * Get AVNU configuration (client-safe)
	 */
	getAvnuConfig() {
		return {
			API_BASE_URL: this.env.getValidatedUrl(
				'PUBLIC_AVNU_API_URL',
				'https://starknet.paymaster.avnu.fi'
			),
			SUPPORTED_GAS_TOKENS: ['USDC', 'USDT', 'ETH'],
			SUPPORTED_CLASS_HASHES: [
				'0x01a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003',
				'0x029927c8af6bccf3f6fda035981e765a7bdbf18a2dc0d630494f8758aa908e2b',
				BLOCKCHAIN.CONTRACT_CLASS_HASHES.ARGENT_040_ACCOUNT
			],
			WEBAUTHN_CLASS_HASH:
				this.env.getPublic('PUBLIC_BIM_ARGENT_050_ACCOUNT_CLASS_HASH') ||
				BLOCKCHAIN.CONTRACT_CLASS_HASHES.BIM_ARGENT_050_ACCOUNT
		};
	}

	/**
	 * Get AVNU server configuration (client-safe only)
	 * For server-side config with private API key, use ServerServiceConfig
	 */
	getAvnuServerConfig() {
		return this.getAvnuConfig();
	}

	/**
	 * Get Starknet configuration (client-safe only)
	 * For server-side use with private RPC URL, use ServerServiceConfig.getStarknetConfig()
	 */
	getStarknetConfig() {
		throw new Error(
			'Client-side RPC access not allowed. Use server-side API endpoints or ServerServiceConfig.getStarknetConfig() for server-side access.'
		);
	}

	/**
	 * Get WebAuthn configuration
	 */
	getWebAuthnConfig() {
		return {
			...BLOCKCHAIN.WEBAUTHN_CONFIG,
			RP_ID: this.env.getPublic('PUBLIC_WEBAUTHN_RP_ID', dev ? 'localhost' : 'yourdomain.com'),
			RP_NAME: this.env.getPublic('PUBLIC_WEBAUTHN_RP_NAME', 'BIM3 WebAuthn Wallet'),
			TIMEOUTS: TimeoutConfig.WEBAUTHN
		};
	}

	/**
	 * Get monitoring configuration (public parts only)
	 * For server-side configuration with private env, use ServerServiceConfig
	 */
	getMonitoringConfig() {
		return {
			...CONFIG.MONITORING,
			SENTRY_DSN: this.env.getValidatedUrl('PUBLIC_SENTRY_DSN', undefined),
			ENABLE_SENTRY: this.env.getBoolean('PUBLIC_ENABLE_SENTRY', true)
		};
	}

	/**
	 * Get Lightning configuration (Atomiq)
	 */
	getLightningConfig() {
		throw new Error(
			'Client-side Lightning RPC access not allowed. Use server-side API endpoints for Lightning operations.'
		);
	}

	/**
	 * Get database configuration (client-safe only)
	 */
	getDatabaseConfig() {
		return {
			...CONFIG.DATABASE,
			// Only include client-safe configuration
			CONNECTION_TIMEOUT: CONFIG.DATABASE.CONNECTION_TIMEOUT,
			QUERY_TIMEOUT: CONFIG.DATABASE.QUERY_TIMEOUT,
			MAX_CONNECTIONS: CONFIG.DATABASE.MAX_CONNECTIONS
		};
	}
}

/**
 * Configuration validation utility
 */
export class ConfigValidator {
	private env: EnvironmentConfig;

	constructor() {
		this.env = EnvironmentConfig.getInstance();
	}

	/**
	 * Validate all critical configuration
	 */
	validateAll(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		try {
			// Validate environment-dependent configs
			if (!dev) {
				this.validateProductionConfig(errors);
			}

			// Validate contract addresses
			const contractValidation = ConstantsValidator.validateContractAddresses();
			if (!contractValidation.valid) {
				errors.push(...contractValidation.errors);
			}

			// Validate API endpoints
			const apiValidation = ConstantsValidator.validateApiEndpoints();
			if (!apiValidation.valid) {
				errors.push(...apiValidation.errors);
			}

			// Validate service-specific configs
			this.validateServiceConfigs(errors);
		} catch (error) {
			errors.push(
				`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}

		return { valid: errors.length === 0, errors };
	}

	private validateProductionConfig(errors: string[]): void {
		// Note: Private environment variable validation should be done server-side
		// This client-safe validation only checks for critical public configuration
		const requiredPublicVars = ['PUBLIC_WEBAUTHN_RP_ID'];
		for (const varName of requiredPublicVars) {
			if (!this.env.getPublic(varName)) {
				errors.push(`Required public environment variable ${varName} is not set for production`);
			}
		}
	}

	private validateServiceConfigs(errors: string[]): void {
		const serviceConfig = new ServiceConfig();

		try {
			serviceConfig.getStarknetConfig();
		} catch (error) {
			errors.push(
				`Starknet config validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}

		try {
			serviceConfig.getWebAuthnConfig();
		} catch (error) {
			errors.push(
				`WebAuthn config validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}
}

// Export singleton instances
export const envConfig = EnvironmentConfig.getInstance();
export const serviceConfig = new ServiceConfig();
export const configValidator = new ConfigValidator();

// Export all constants for backward compatibility
export { ConstantsValidator } from '../constants/index';
export { API, BLOCKCHAIN, CONFIG, UI };

// Export types
export type { NetworkName, SupportedAsset } from '../constants/blockchain.constants';
export type { Environment, LogLevel } from '../constants/config.constants';
