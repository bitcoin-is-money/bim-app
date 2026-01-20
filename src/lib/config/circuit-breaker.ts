/**
 * Circuit Breaker Configuration Management
 * Centralized configuration management for circuit breakers with environment-based customization
 */

import {
	CIRCUIT_BREAKER_CONFIGS,
	CircuitBreakerConfigBuilder,
	ConfigurationUtils
} from '../utils/network/circuit-breaker/configurations';
import type { CircuitBreakerConfig } from '../utils/network/circuit-breaker/types';
import { envConfig } from './index';

/**
 * Environment-aware circuit breaker configuration manager
 */
export class CircuitBreakerConfigManager {
	private static instance: CircuitBreakerConfigManager;

	private constructor() {}

	static getInstance(): CircuitBreakerConfigManager {
		if (!CircuitBreakerConfigManager.instance) {
			CircuitBreakerConfigManager.instance = new CircuitBreakerConfigManager();
		}
		return CircuitBreakerConfigManager.instance;
	}

	/**
	 * Get circuit breaker configuration with environment overrides
	 */
	getConfig(
		service: keyof typeof CIRCUIT_BREAKER_CONFIGS,
		overrides: Partial<CircuitBreakerConfig> = {}
	): Partial<CircuitBreakerConfig> {
		const baseConfig = CIRCUIT_BREAKER_CONFIGS[service];
		const envOverrides = this.getEnvironmentOverrides(service);

		return {
			...baseConfig,
			...envOverrides,
			...overrides
		};
	}

	/**
	 * Get environment-specific overrides for circuit breaker configuration
	 */
	private getEnvironmentOverrides(service: string): Partial<CircuitBreakerConfig> {
		const overrides: Partial<CircuitBreakerConfig> = {};

		// Service-specific environment variable overrides
		const serviceUpper = service.toUpperCase();

		// Failure threshold override
		const failureThreshold = envConfig.getNumber(
			`CIRCUIT_BREAKER_${serviceUpper}_FAILURE_THRESHOLD`
		);
		if (failureThreshold > 0) {
			overrides.failureThreshold = failureThreshold;
		}

		// Recovery timeout override
		const recoveryTimeout = envConfig.getNumber(`CIRCUIT_BREAKER_${serviceUpper}_RECOVERY_TIMEOUT`);
		if (recoveryTimeout > 0) {
			overrides.recoveryTimeout = recoveryTimeout;
		}

		// Failure window override
		const failureWindow = envConfig.getNumber(`CIRCUIT_BREAKER_${serviceUpper}_FAILURE_WINDOW`);
		if (failureWindow > 0) {
			overrides.failureWindow = failureWindow;
		}

		// Success threshold override
		const successThreshold = envConfig.getNumber(
			`CIRCUIT_BREAKER_${serviceUpper}_SUCCESS_THRESHOLD`
		);
		if (successThreshold > 0) {
			overrides.successThreshold = successThreshold;
		}

		return overrides;
	}

	/**
	 * Create a new circuit breaker configuration using the builder pattern
	 */
	createConfig(name: string): CircuitBreakerConfigBuilder {
		return CircuitBreakerConfigBuilder.create().withName(name);
	}

	/**
	 * Get all available configuration presets
	 */
	getAllConfigs(): Record<string, Partial<CircuitBreakerConfig>> {
		const configs: Record<string, Partial<CircuitBreakerConfig>> = {};

		for (const [service, _config] of Object.entries(CIRCUIT_BREAKER_CONFIGS)) {
			configs[service] = this.getConfig(service as keyof typeof CIRCUIT_BREAKER_CONFIGS);
		}

		return configs;
	}

	/**
	 * Validate circuit breaker configuration
	 */
	validateConfig(config: Partial<CircuitBreakerConfig>): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (config.failureThreshold !== undefined) {
			if (!Number.isInteger(config.failureThreshold) || config.failureThreshold <= 0) {
				errors.push('Failure threshold must be a positive integer');
			}
		}

		if (config.failureWindow !== undefined) {
			if (!Number.isInteger(config.failureWindow) || config.failureWindow <= 0) {
				errors.push('Failure window must be a positive integer (milliseconds)');
			}
		}

		if (config.recoveryTimeout !== undefined) {
			if (!Number.isInteger(config.recoveryTimeout) || config.recoveryTimeout <= 0) {
				errors.push('Recovery timeout must be a positive integer (milliseconds)');
			}
		}

		if (config.successThreshold !== undefined) {
			if (!Number.isInteger(config.successThreshold) || config.successThreshold <= 0) {
				errors.push('Success threshold must be a positive integer');
			}
		}

		// Logical validations
		if (
			config.failureThreshold &&
			config.successThreshold &&
			config.successThreshold > config.failureThreshold
		) {
			errors.push('Success threshold should not be greater than failure threshold');
		}

		if (
			config.failureWindow &&
			config.recoveryTimeout &&
			config.recoveryTimeout > config.failureWindow
		) {
			errors.push('Recovery timeout should not be greater than failure window');
		}

		return { valid: errors.length === 0, errors };
	}
}

/**
 * Service-specific circuit breaker configuration factories
 */
export const CircuitBreakerConfigs = {
	/**
	 * Get Lightning service circuit breaker configuration
	 */
	lightning: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('lightning', overrides),

	/**
	 * Get API service circuit breaker configuration
	 */
	api: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('api', overrides),

	/**
	 * Get pricing service circuit breaker configuration
	 */
	pricing: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('pricing', overrides),

	/**
	 * Get webhook service circuit breaker configuration
	 */
	webhook: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('webhook', overrides),

	/**
	 * Get database service circuit breaker configuration
	 */
	database: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('database', overrides),

	/**
	 * Get cache service circuit breaker configuration
	 */
	cache: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('cache', overrides),

	/**
	 * Get payment service circuit breaker configuration
	 */
	payment: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('payment', overrides),

	/**
	 * Get real-time service circuit breaker configuration
	 */
	realtime: (overrides?: Partial<CircuitBreakerConfig>) =>
		CircuitBreakerConfigManager.getInstance().getConfig('realtime', overrides),

	/**
	 * Create custom configuration using utility patterns
	 */
	custom: {
		fastRecovery: (name: string) => ConfigurationUtils.fastRecovery(name),
		conservative: (name: string) => ConfigurationUtils.conservative(name),
		httpApi: (name: string, statusCodes?: number[]) =>
			ConfigurationUtils.httpApi(name, statusCodes),
		exponentialBackoff: (name: string, maxBackoff?: number) =>
			ConfigurationUtils.exponentialBackoff(name, maxBackoff)
	},

	/**
	 * Create completely custom configuration
	 */
	builder: (name: string) => CircuitBreakerConfigManager.getInstance().createConfig(name)
};

/**
 * Environment-specific configuration profiles
 */
export const EnvironmentProfiles = {
	/**
	 * Development environment - More lenient settings for testing
	 */
	development: {
		failureThreshold: 10,
		recoveryTimeout: 5_000, // 5 seconds
		successThreshold: 1
	} as Partial<CircuitBreakerConfig>,

	/**
	 * Staging environment - Balanced settings
	 */
	staging: {
		failureThreshold: 5,
		recoveryTimeout: 15_000, // 15 seconds
		successThreshold: 2
	} as Partial<CircuitBreakerConfig>,

	/**
	 * Production environment - Conservative settings
	 */
	production: {
		failureThreshold: 3,
		recoveryTimeout: 30_000, // 30 seconds
		successThreshold: 5
	} as Partial<CircuitBreakerConfig>
};

/**
 * Get environment-specific configuration profile
 */
export function getEnvironmentProfile(): Partial<CircuitBreakerConfig> {
	const environment = envConfig.getPublic(
		'NODE_ENV',
		'development'
	) as keyof typeof EnvironmentProfiles;
	return EnvironmentProfiles[environment] || EnvironmentProfiles.development;
}

// Export singleton instance and utilities
export const circuitBreakerConfigManager = CircuitBreakerConfigManager.getInstance();
export { CircuitBreakerConfigBuilder, ConfigurationUtils };

// Export types for convenience
export type { CircuitBreakerConfig } from '../utils/network/circuit-breaker/types';
