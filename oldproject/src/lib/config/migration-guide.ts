/**
 * Configuration Migration Guide and Utilities
 * Helper functions and examples for migrating from scattered config to centralized config
 */

import { serviceConfig, configValidator } from './index';
import { EnvValidation } from './env';
import { CircuitBreakerConfigs } from './circuit-breaker';
import { ConfigValidators } from './validators';

/**
 * Migration helper class to assist services in adopting centralized configuration
 */
export class ConfigMigrationHelper {
	/**
	 * Example: Replace direct environment variable access with centralized config
	 */
	static exampleEnvironmentMigration() {
		// OLD WAY (scattered throughout codebase):
		// import { env } from '$env/dynamic/public';
		// const rpcUrl = env.PUBLIC_STARKNET_RPC_URL || 'default-url';

		// NEW WAY (centralized):
		const rpcUrl = PublicEnv.STARKNET_RPC_URL();

		return { rpcUrl };
	}

	/**
	 * Example: Replace direct timeout constants with centralized timeouts
	 */
	static exampleTimeoutMigration() {
		// OLD WAY:
		// const API_TIMEOUT = 30_000;
		// const WEBAUTHN_TIMEOUT = 120_000;

		// NEW WAY:
		const apiTimeout = TimeoutConfig.API.REQUEST;
		const webauthnTimeout = TimeoutConfig.WEBAUTHN.CREATE;

		return { apiTimeout, webauthnTimeout };
	}

	/**
	 * Example: Replace service-specific configuration with centralized service config
	 */
	static exampleServiceConfigMigration() {
		// OLD WAY:
		// const starknetConfig = {
		//   rpcUrl: env.PUBLIC_STARKNET_RPC_URL,
		//   chainId: env.PUBLIC_STARKNET_CHAIN_ID,
		//   contractHashes: CONTRACT_CLASS_HASHES
		// };

		// NEW WAY:
		const starknetConfig = serviceConfig.getStarknetConfig();
		const webauthnConfig = serviceConfig.getWebAuthnConfig();
		const databaseConfig = serviceConfig.getDatabaseConfig();

		return { starknetConfig, webauthnConfig, databaseConfig };
	}

	/**
	 * Example: Replace manual circuit breaker configuration with centralized presets
	 */
	static exampleCircuitBreakerMigration() {
		// OLD WAY:
		// const circuitBreakerConfig = {
		//   failureThreshold: 5,
		//   recoveryTimeout: 30_000,
		//   // ... more manual configuration
		// };

		// NEW WAY:
		const lightningCircuitBreaker = CircuitBreakerConfigs.lightning();
		const apiCircuitBreaker = CircuitBreakerConfigs.api();
		const customCircuitBreaker = CircuitBreakerConfigs.builder('my-service')
			.withFailureThreshold(3)
			.withRecoveryTimeout(15_000)
			.build();

		return { lightningCircuitBreaker, apiCircuitBreaker, customCircuitBreaker };
	}

	/**
	 * Example: Replace manual validation with centralized validators
	 */
	static exampleValidationMigration() {
		// OLD WAY:
		// function isValidUrl(url: string): boolean {
		//   try {
		//     new URL(url);
		//     return true;
		//   } catch {
		//     return false;
		//   }
		// }

		// NEW WAY:
		const isValidUrl = ConfigValidators.isValidUrl;
		const isValidStarknetAddress = ConfigValidators.isValidStarknetAddress;
		const isValidTimeout = ConfigValidators.isValidTimeoutMs;

		// Use validators
		const url = 'https://example.com';
		const urlIsValid = isValidUrl(url);

		return { urlIsValid, isValidUrl, isValidStarknetAddress, isValidTimeout };
	}

	/**
	 * Example: Environment-specific configuration handling
	 */
	static exampleEnvironmentHandling() {
		// OLD WAY:
		// const isDev = process.env.NODE_ENV === 'development';
		// const isProduction = process.env.NODE_ENV === 'production';

		// NEW WAY:
		const environment = EnvValidation.getEnvironment();
		const isDevelopment = EnvValidation.isDevelopment();
		const isProduction = EnvValidation.isProduction();

		// Environment-specific configuration
		let timeoutMultiplier = 1;
		if (isDevelopment) {
			timeoutMultiplier = 2; // More lenient timeouts in development
		} else if (isProduction) {
			timeoutMultiplier = 0.8; // Stricter timeouts in production
		}

		return { environment, isDevelopment, isProduction, timeoutMultiplier };
	}

	/**
	 * Complete service configuration migration example
	 */
	static exampleCompleteServiceMigration() {
		// Example service that needs complete configuration
		class ExampleService {
			private config: {
				starknet: ReturnType<typeof serviceConfig.getStarknetConfig>;
				webauthn: ReturnType<typeof serviceConfig.getWebAuthnConfig>;
				circuitBreaker: ReturnType<typeof CircuitBreakerConfigs.api>;
				timeouts: typeof TimeoutConfig;
			};

			constructor() {
				// Initialize with centralized configuration
				this.config = {
					starknet: serviceConfig.getStarknetConfig(),
					webauthn: serviceConfig.getWebAuthnConfig(),
					circuitBreaker: CircuitBreakerConfigs.api(),
					timeouts: TimeoutConfig
				};

				// Validate configuration
				this.validateConfiguration();
			}

			private validateConfiguration(): void {
				const validation = configValidator.validateAll();
				if (!validation.valid) {
					throw new Error(
						`Service configuration validation failed: ${validation.errors.join(', ')}`
					);
				}
			}

			getStarknetRpcUrl(): string {
				return this.config.starknet.RPC_URL;
			}

			getApiTimeout(): number {
				return this.config.timeouts.API.REQUEST;
			}

			getCircuitBreakerConfig() {
				return this.config.circuitBreaker;
			}
		}

		return ExampleService;
	}

	/**
	 * Generate migration checklist for a service
	 */
	static generateMigrationChecklist(serviceName: string): string[] {
		return [
			`✅ Replace direct 'env' imports with 'PublicEnv' or 'PrivateEnv' from '$lib/config/env'`,
			`✅ Replace hardcoded timeouts with 'TimeoutConfig' from '$lib/config'`,
			`✅ Replace service-specific config objects with 'serviceConfig.get${serviceName}Config()'`,
			`✅ Replace manual circuit breaker config with 'CircuitBreakerConfigs.${serviceName.toLowerCase()}()'`,
			`✅ Replace custom validation functions with 'ConfigValidators' from '$lib/config/validators'`,
			`✅ Add configuration validation using 'configValidator.validateAll()'`,
			`✅ Update tests to use centralized configuration`,
			`✅ Remove old configuration files and constants if no longer needed`,
			`✅ Update imports to use new centralized config paths`,
			`✅ Verify environment variables work with new system using 'EnvValidation'`
		];
	}

	/**
	 * Get all available configuration utilities
	 */
	static getAvailableUtilities(): Record<string, string> {
		return {
			serviceConfig: 'Central service configuration factory with typed access',
			envConfig: 'Environment variable accessor with validation',
			'PublicEnv / PrivateEnv': 'Type-safe environment variable accessors',
			TimeoutConfig: 'Hierarchical timeout configuration',
			ConfigValidators: 'Comprehensive validation utilities',
			CircuitBreakerConfigs: 'Pre-configured circuit breaker settings',
			configValidator: 'System-wide configuration validation',
			EnvValidation: 'Environment-specific validation and helpers'
		};
	}
}

/**
 * Migration examples for common patterns
 */
export const MigrationExamples = {
	// Before/After examples for common migration patterns

	environmentAccess: {
		before: `
      import { env } from '$env/dynamic/public';
      const rpcUrl = env.PUBLIC_STARKNET_RPC_URL || 'fallback';
    `,
		after: `
      import { PublicEnv } from '$lib/config/env';
      const rpcUrl = PublicEnv.STARKNET_RPC_URL();
    `
	},

	serviceConfiguration: {
		before: `
      import { CONTRACT_CLASS_HASHES } from '$lib/constants';
      import { env } from '$env/dynamic/public';
      
      const config = {
        rpcUrl: env.PUBLIC_STARKNET_RPC_URL,
        contractHashes: CONTRACT_CLASS_HASHES,
        timeout: 30_000,
      };
    `,
		after: `
      import { serviceConfig } from '$lib/config';
      
      const config = serviceConfig.getStarknetConfig();
    `
	},

	validation: {
		before: `
      function isValidUrl(url: string): boolean {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      }
    `,
		after: `
      import { ConfigValidators } from '$lib/config/validators';
      
      const isValidUrl = ConfigValidators.isValidUrl;
    `
	},

	circuitBreaker: {
		before: `
      import { CIRCUIT_BREAKER } from '$lib/constants';
      
      const config = {
        failureThreshold: CIRCUIT_BREAKER.FAILURE_THRESHOLD,
        recoveryTimeout: CIRCUIT_BREAKER.RECOVERY_TIMEOUT,
        // manual configuration...
      };
    `,
		after: `
      import { CircuitBreakerConfigs } from '$lib/config/circuit-breaker';
      
      const config = CircuitBreakerConfigs.api();
    `
	}
};

// Export the helper class as the default export
export default ConfigMigrationHelper;
