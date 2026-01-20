/**
 * @fileoverview Retry Utilities with Exponential Backoff
 *
 * This module provides retry functionality with exponential backoff for
 * handling transient failures in Lightning Network operations and external
 * API calls. It includes configurable retry strategies and error handling.
 *
 * Key Features:
 * - Exponential backoff with jitter
 * - Configurable retry strategies
 * - Error type-based retry decisions
 * - Promise-based API with TypeScript support
 * - Comprehensive logging and monitoring
 *
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/errors/lightning - Lightning error types
 *
 * @author bim
 * @version 1.0.0
 */

import { LightningError, LightningErrorCode } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';

/**
 * Retry configuration options
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxAttempts: number;
	/** Initial delay in milliseconds */
	initialDelay: number;
	/** Maximum delay between retries */
	maxDelay: number;
	/** Backoff multiplier for exponential backoff */
	backoffMultiplier: number;
	/** Add random jitter to prevent thundering herd */
	jitter: boolean;
	/** Timeout for each individual attempt */
	timeout?: number;
	/** Custom function to determine if error should be retried */
	shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxAttempts: 3,
	initialDelay: 1000, // 1 second
	maxDelay: 30000, // 30 seconds
	backoffMultiplier: 2,
	jitter: true,
	timeout: 10000, // 10 seconds per attempt
	shouldRetry: defaultShouldRetry
};

/**
 * Specific retry configurations for different operations
 */
export const RETRY_CONFIGS = {
	/** Network operations (API calls, external services) */
	network: {
		...DEFAULT_RETRY_CONFIG,
		maxAttempts: 3,
		initialDelay: 1000,
		maxDelay: 10000
	},

	/** Lightning Network operations */
	lightning: {
		...DEFAULT_RETRY_CONFIG,
		maxAttempts: 5,
		initialDelay: 2000,
		maxDelay: 30000
	},

	/** Pricing and quote operations */
	pricing: {
		...DEFAULT_RETRY_CONFIG,
		maxAttempts: 3,
		initialDelay: 500,
		maxDelay: 5000
	},

	/** Webhook operations */
	webhook: {
		...DEFAULT_RETRY_CONFIG,
		maxAttempts: 2,
		initialDelay: 1000,
		maxDelay: 5000
	},

	/** Database operations */
	database: {
		...DEFAULT_RETRY_CONFIG,
		maxAttempts: 3,
		initialDelay: 100,
		maxDelay: 1000
	}
};

/**
 * Default function to determine if an error should be retried
 */
function defaultShouldRetry(error: Error, attempt: number): boolean {
	// Don't retry if we're at max attempts
	if (attempt >= DEFAULT_RETRY_CONFIG.maxAttempts) {
		return false;
	}

	// Handle Lightning-specific errors
	if (error instanceof LightningError) {
		const nonRetryableCodes = [
			LightningErrorCode.INVALID_AMOUNT,
			LightningErrorCode.INVALID_ADDRESS,
			LightningErrorCode.UNSUPPORTED_ASSET,
			LightningErrorCode.VALIDATION_ERROR,
			LightningErrorCode.WEBHOOK_INVALID_SIGNATURE
		];

		return !nonRetryableCodes.includes(error.code);
	}

	// Handle HTTP errors
	if (error.message.includes('HTTP')) {
		const statusMatch = error.message.match(/HTTP (\d+)/);
		if (statusMatch) {
			const status = parseInt(statusMatch[1]);
			// Retry on 5xx errors and some 4xx errors
			return status >= 500 || status === 429 || status === 408;
		}
	}

	// Handle network errors
	const networkErrors = [
		'NETWORK_ERROR',
		'TIMEOUT_ERROR',
		'CONNECTION_FAILED',
		'ECONNRESET',
		'ECONNREFUSED',
		'ETIMEDOUT'
	];

	return networkErrors.some(
		(errorType) => error.message.includes(errorType) || error.name.includes(errorType)
	);
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
	const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
	const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

	if (config.jitter) {
		// Add random jitter (±25%)
		const jitterAmount = cappedDelay * 0.25;
		const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
		return Math.max(0, cappedDelay + jitter);
	}

	return cappedDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
	operation: () => Promise<T>,
	config: Partial<RetryConfig> = {},
	operationName?: string
): Promise<T> {
	const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
	let lastError: Error;

	for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
		try {
			// Log retry attempt
			if (attempt > 0) {
				logger.info(`Retry attempt ${attempt + 1}/${finalConfig.maxAttempts}`, {
					operation: operationName || 'unknown',
					attempt: attempt + 1,
					maxAttempts: finalConfig.maxAttempts
				});
			}

			// Execute operation with timeout if specified
			let result: T;
			if (finalConfig.timeout) {
				result = await Promise.race([
					operation(),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error(`Operation timeout after ${finalConfig.timeout}ms`)),
							finalConfig.timeout
						)
					)
				]);
			} else {
				result = await operation();
			}

			// Log success if this was a retry
			if (attempt > 0) {
				logger.info(`Operation succeeded after ${attempt + 1} attempts`, {
					operation: operationName || 'unknown',
					attempts: attempt + 1
				});
			}

			return result;
		} catch (error) {
			lastError = error as Error;

			// Check if we should retry this error
			if (!finalConfig.shouldRetry!(lastError, attempt)) {
				logger.warn(`Not retrying error`, {
					operation: operationName || 'unknown',
					attempt: attempt + 1,
					error: lastError.message
				});
				break;
			}

			// If this is the last attempt, don't delay
			if (attempt === finalConfig.maxAttempts - 1) {
				logger.error(`All retry attempts failed`, lastError, {
					operation: operationName || 'unknown',
					totalAttempts: finalConfig.maxAttempts
				});
				break;
			}

			// Calculate delay and wait
			const delay = calculateDelay(attempt, finalConfig);
			logger.warn(`Operation failed, retrying in ${delay}ms`, {
				operation: operationName || 'unknown',
				attempt: attempt + 1,
				maxAttempts: finalConfig.maxAttempts,
				error: lastError.message,
				delay
			});

			await sleep(delay);
		}
	}

	// All attempts failed
	throw lastError;
}

/**
 * Retry wrapper for Lightning Network operations
 */
export async function retryLightningOperation<T>(
	operation: () => Promise<T>,
	operationName?: string
): Promise<T> {
	return retry(operation, RETRY_CONFIGS.lightning, operationName);
}

/**
 * Retry wrapper for network operations
 */
export async function retryNetworkOperation<T>(
	operation: () => Promise<T>,
	operationName?: string
): Promise<T> {
	return retry(operation, RETRY_CONFIGS.network, operationName);
}

/**
 * Retry wrapper for pricing operations
 */
export async function retryPricingOperation<T>(
	operation: () => Promise<T>,
	operationName?: string
): Promise<T> {
	return retry(operation, RETRY_CONFIGS.pricing, operationName);
}

/**
 * Retry wrapper for webhook operations
 */
export async function retryWebhookOperation<T>(
	operation: () => Promise<T>,
	operationName?: string
): Promise<T> {
	return retry(operation, RETRY_CONFIGS.webhook, operationName);
}

/**
 * Retry wrapper for database operations
 */
export async function retryDatabaseOperation<T>(
	operation: () => Promise<T>,
	operationName?: string
): Promise<T> {
	return retry(operation, RETRY_CONFIGS.database, operationName);
}

/**
 * Retry with custom configuration
 */
export function createRetryFunction<T>(
	config: Partial<RetryConfig>
): (operation: () => Promise<T>, operationName?: string) => Promise<T> {
	return (operation: () => Promise<T>, operationName?: string) => {
		return retry(operation, config, operationName);
	};
}

/**
 * Batch retry operations with independent failure handling
 */
export async function retryBatch<T>(
	operations: Array<{
		operation: () => Promise<T>;
		name?: string;
		config?: Partial<RetryConfig>;
	}>
): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
	const results = await Promise.allSettled(
		operations.map(async ({ operation, name, config }) => {
			try {
				const result = await retry(operation, config, name);
				return { success: true, result };
			} catch (error) {
				return { success: false, error: error as Error };
			}
		})
	);

	return results.map((result) =>
		result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
	);
}

/**
 * Retry with conditional logic
 */
export async function retryWithCondition<T>(
	operation: () => Promise<T>,
	condition: (result: T) => boolean,
	config: Partial<RetryConfig> = {},
	operationName?: string
): Promise<T> {
	const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
	let lastResult: T;

	for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
		try {
			lastResult = await operation();

			if (condition(lastResult)) {
				if (attempt > 0) {
					logger.info(`Condition met after ${attempt + 1} attempts`, {
						operation: operationName || 'unknown',
						attempts: attempt + 1
					});
				}
				return lastResult;
			}

			if (attempt === finalConfig.maxAttempts - 1) {
				logger.warn(`Condition not met after ${finalConfig.maxAttempts} attempts`, {
					operation: operationName || 'unknown',
					totalAttempts: finalConfig.maxAttempts
				});
				break;
			}

			const delay = calculateDelay(attempt, finalConfig);
			logger.info(`Condition not met, retrying in ${delay}ms`, {
				operation: operationName || 'unknown',
				attempt: attempt + 1,
				delay
			});

			await sleep(delay);
		} catch (error) {
			throw error;
		}
	}

	return lastResult!;
}
