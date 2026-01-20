/**
 * Shared Configuration Validation Utilities
 * Comprehensive validation functions for configuration values
 */

import { ConstantsValidator } from '../constants/index';

/**
 * Enhanced validation utilities for configuration
 */
export class ConfigValidators {
	/**
	 * Validate Starknet contract address format
	 */
	static isValidStarknetAddress(address: string): boolean {
		return /^0x[0-9a-fA-F]{63,64}$/.test(address);
	}

	/**
	 * Validate Ethereum address format
	 */
	static isValidEthereumAddress(address: string): boolean {
		return /^0x[0-9a-fA-F]{40}$/.test(address);
	}

	/**
	 * Validate Bitcoin address format (basic check)
	 */
	static isValidBitcoinAddress(address: string): boolean {
		// Basic validation - covers most common formats
		return (
			/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || // Legacy P2PKH/P2SH
			/^bc1[a-z0-9]{39,59}$/.test(address) || // Bech32 mainnet
			/^tb1[a-z0-9]{39,59}$/.test(address)
		); // Bech32 testnet
	}

	/**
	 * Validate network chain ID format
	 */
	static isValidChainId(chainId: string): boolean {
		return /^SN_(MAIN|SEPOLIA)$/.test(chainId) || /^0x[0-9a-fA-F]+$/.test(chainId);
	}

	/**
	 * Validate API key format
	 */
	static isValidApiKey(apiKey: string): boolean {
		return apiKey.length >= 32 && /^[A-Za-z0-9_\-\.]+$/.test(apiKey);
	}

	/**
	 * Validate database URL format
	 */
	static isValidDatabaseUrl(url: string): boolean {
		return /^(postgresql|postgres|mysql|sqlite):\/\//.test(url);
	}

	/**
	 * Validate port number
	 */
	static isValidPort(port: number): boolean {
		return Number.isInteger(port) && port >= 1 && port <= 65535;
	}

	/**
	 * Validate Bitcoin network name
	 */
	static isValidBitcoinNetwork(network: string): boolean {
		return ['mainnet', 'testnet', 'regtest'].includes(network);
	}

	/**
	 * Validate timeout value (in milliseconds)
	 */
	static isValidTimeoutMs(timeout: number): boolean {
		return Number.isInteger(timeout) && timeout > 0 && timeout <= 300_000; // Max 5 minutes
	}

	/**
	 * Validate WebAuthn RP ID format
	 */
	static isValidRpId(rpId: string): boolean {
		// Should be a valid hostname or localhost
		return (
			rpId === 'localhost' ||
			/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(
				rpId
			)
		);
	}

	/**
	 * Validate environment name
	 */
	static isValidEnvironment(env: string): boolean {
		return ['development', 'staging', 'production'].includes(env);
	}

	/**
	 * Validate URL format
	 */
	static isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Validate JSON string
	 */
	static isValidJson(jsonString: string): boolean {
		try {
			JSON.parse(jsonString);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Validate file size (in bytes)
	 */
	static isValidFileSize(size: number, maxSize: number = 10_000_000): boolean {
		return Number.isInteger(size) && size > 0 && size <= maxSize;
	}

	/**
	 * Validate MIME type
	 */
	static isValidMimeType(mimeType: string, allowedTypes: string[] = []): boolean {
		if (allowedTypes.length === 0) {
			// Default allowed types for web apps
			allowedTypes = [
				'image/jpeg',
				'image/png',
				'image/webp',
				'image/gif',
				'text/plain',
				'application/json'
			];
		}
		return allowedTypes.includes(mimeType);
	}

	/**
	 * Validate percentage value (0-100)
	 */
	static isValidPercentage(value: number): boolean {
		return typeof value === 'number' && value >= 0 && value <= 100;
	}

	/**
	 * Validate rate limit configuration
	 */
	static isValidRateLimit(windowMs: number, maxRequests: number): boolean {
		return this.isValidTimeoutMs(windowMs) && Number.isInteger(maxRequests) && maxRequests > 0;
	}

	/**
	 * Comprehensive service configuration validation
	 */
	static validateServiceConfig(config: Record<string, any>): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		// Validate Starknet configuration
		if (config.starknet) {
			if (config.starknet.rpcUrl && !this.isValidUrl(config.starknet.rpcUrl)) {
				errors.push('Invalid Starknet RPC URL');
			}
			if (config.starknet.chainId && !this.isValidChainId(config.starknet.chainId)) {
				errors.push('Invalid Starknet chain ID');
			}
		}

		// Validate WebAuthn configuration
		if (config.webauthn) {
			if (config.webauthn.rpId && !this.isValidRpId(config.webauthn.rpId)) {
				errors.push('Invalid WebAuthn RP ID');
			}
			if (config.webauthn.timeout && !this.isValidTimeoutMs(config.webauthn.timeout)) {
				errors.push('Invalid WebAuthn timeout');
			}
		}

		// Validate database configuration
		if (config.database) {
			if (config.database.url && !this.isValidDatabaseUrl(config.database.url)) {
				errors.push('Invalid database URL');
			}
			if (
				config.database.maxConnections &&
				(!Number.isInteger(config.database.maxConnections) || config.database.maxConnections <= 0)
			) {
				errors.push('Invalid database max connections');
			}
		}

		// Validate security configuration
		if (config.security) {
			if (config.security.sessionSecret && config.security.sessionSecret.length < 32) {
				errors.push('Session secret is too short (minimum 32 characters)');
			}
		}

		// Validate monitoring configuration
		if (config.monitoring) {
			if (config.monitoring.sentryDsn && !this.isValidUrl(config.monitoring.sentryDsn)) {
				errors.push('Invalid Sentry DSN URL');
			}
			if (
				config.monitoring.sampleRate &&
				!this.isValidPercentage(config.monitoring.sampleRate * 100)
			) {
				errors.push('Invalid monitoring sample rate');
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validate environment-specific requirements
	 */
	static validateEnvironmentRequirements(
		environment: string,
		config: Record<string, any>
	): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!this.isValidEnvironment(environment)) {
			errors.push(`Invalid environment: ${environment}`);
			return { valid: false, errors };
		}

		switch (environment) {
			case 'production':
				// Production-specific validations
				if (!config.database?.url) {
					errors.push('Database URL is required in production');
				}
				if (!config.security?.sessionSecret) {
					errors.push('Session secret is required in production');
				}
				if (config.features?.enableDebugMode) {
					errors.push('Debug mode should be disabled in production');
				}
				break;

			case 'staging':
				// Staging-specific validations
				if (!config.database?.url) {
					errors.push('Database URL is required in staging');
				}
				break;

			case 'development':
				// Development-specific validations (more lenient)
				if (config.security?.sessionSecret && config.security.sessionSecret === 'dev-secret') {
					errors.push('Default development session secret detected - use a secure secret');
				}
				break;
		}

		return { valid: errors.length === 0, errors };
	}
}

/**
 * Validation result interface
 */
export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings?: string[];
}

/**
 * Configuration validation orchestrator
 */
export class ConfigurationValidator {
	/**
	 * Run all configuration validations
	 */
	static validateAll(config: Record<string, any>, environment: string): ValidationResult {
		const allErrors: string[] = [];
		const warnings: string[] = [];

		// Basic service config validation
		const serviceValidation = ConfigValidators.validateServiceConfig(config);
		if (!serviceValidation.valid) {
			allErrors.push(...serviceValidation.errors);
		}

		// Environment-specific validation
		const envValidation = ConfigValidators.validateEnvironmentRequirements(environment, config);
		if (!envValidation.valid) {
			allErrors.push(...envValidation.errors);
		}

		// Add warnings for common issues
		if (environment === 'production' && config.features?.enableDebugMode) {
			warnings.push('Debug mode is enabled in production environment');
		}

		if (!config.monitoring?.sentryDsn && environment === 'production') {
			warnings.push('No error monitoring configured for production');
		}

		return {
			valid: allErrors.length === 0,
			errors: allErrors,
			warnings
		};
	}
}

// Export individual validators for specific use cases
export { ConstantsValidator, ConfigValidators as Validators };
