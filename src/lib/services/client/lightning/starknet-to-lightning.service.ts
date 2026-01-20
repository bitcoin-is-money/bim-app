/**
 * @fileoverview Starknet to Lightning Service
 *
 * Handles Starknet to Lightning swap operations.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import { TIMEOUTS } from '$lib/constants';
import { LightningErrorCode, LightningServiceError } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';

export interface StarknetToLightningSwap {
	swapId: string;
	starknetAddress: string; // Address to send Starknet assets to
	estimatedOutput: number; // Estimated BTC output in satoshis (determined by Lightning invoice)
	fees: {
		network: number;
		swap: number;
		total: number;
	};
	expiresAt: string;
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
}

export interface StarknetToLightningParams {
	sourceAsset: 'WBTC';
	starknetAddress: string; // Starknet address to send assets from
	lightningAddress: string; // Lightning address/invoice to receive BTC
	amountInSats?: number; // Amount to send in satoshis (optional if invoice has amount)
	expirationMinutes?: number;
}

export class StarknetToLightningService {
	private baseUrl: string;
	private maxRetries: number = 3;
	private retryDelay: number = 2000; // 2 seconds

	constructor(baseUrl: string = '/api/lightning') {
		this.baseUrl = baseUrl;
	}

	/**
	 * Create a Starknet to Lightning swap with retry logic
	 *
	 * Creates a swap where users send Starknet assets and receive Bitcoin
	 * via Lightning Network. Returns a Starknet address for payment.
	 *
	 * @param params - Swap creation parameters
	 * @returns Promise resolving to swap data
	 *
	 * @example
	 * ```typescript
	 * const swap = await starknetToLightningService.createStarknetToLightningSwap({
	 *   amount: 1000000000000000000, // 1 ETH in wei
	 *   sourceAsset: 'ETH',
	 *   lightningAddress: 'user@lightning.com'
	 * });
	 * ```
	 */
	async createStarknetToLightningSwap(
		params: StarknetToLightningParams
	): Promise<StarknetToLightningSwap> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
			try {
				logger.info(
					`Creating Starknet to Lightning swap (attempt ${attempt}/${this.maxRetries})`,
					params
				);

				const result = await this.attemptCreateSwap(params, attempt);
				return result;
			} catch (error) {
				lastError = error as Error;

				// Don't retry on certain error types
				if (this.shouldNotRetry(error as Error)) {
					throw error;
				}

				if (attempt < this.maxRetries) {
					logger.warn(
						`Swap creation failed (attempt ${attempt}), retrying in ${this.retryDelay}ms`,
						{
							error: (error as Error).message,
							attempt,
							maxRetries: this.maxRetries
						}
					);

					await this.delay(this.retryDelay);
					// Exponential backoff
					this.retryDelay = Math.min(this.retryDelay * 1.5, 10000);
				}
			}
		}

		// All retries failed
		logger.error(
			`All ${this.maxRetries} attempts to create Starknet to Lightning swap failed`,
			lastError || new Error('Unknown error')
		);
		throw lastError || new Error('All retry attempts failed');
	}

	/**
	 * Attempt to create a swap (single attempt)
	 */
	private async attemptCreateSwap(
		params: StarknetToLightningParams,
		attempt: number
	): Promise<StarknetToLightningSwap> {
		// Create AbortController for request timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			controller.abort();
			logger.warn('Starknet to Lightning swap request timed out', {
				timeout: TIMEOUTS.LIGHTNING_OPERATION,
				params,
				attempt
			});
		}, TIMEOUTS.LIGHTNING_OPERATION);

		try {
			logger.info('Making Starknet to Lightning swap request', {
				url: `${this.baseUrl}/create-starknet-to-lightning`,
				params,
				timeout: TIMEOUTS.LIGHTNING_OPERATION,
				attempt
			});

			const response = await fetch(`${this.baseUrl}/create-starknet-to-lightning`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(params),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new LightningServiceError(
					LightningErrorCode.INVOICE_CREATION_FAILED,
					`Failed to create Starknet to Lightning swap: ${response.statusText}`,
					'Failed to create Starknet to Lightning swap. Please try again.',
					errorData
				);
			}

			const data = await response.json();
			logger.info('Starknet to Lightning swap created successfully', {
				swapId: data.data.swapId,
				sourceAsset: params.sourceAsset,
				starknetAddress: params.starknetAddress.substring(0, 10) + '...',
				attempt
			});

			return data.data;
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	/**
	 * Determine if an error should not be retried
	 */
	private shouldNotRetry(error: Error): boolean {
		// Don't retry on validation errors or permanent failures
		if (error instanceof LightningServiceError) {
			return (
				error.code === LightningErrorCode.VALIDATION_ERROR ||
				error.code === LightningErrorCode.INVALID_AMOUNT ||
				error.code === LightningErrorCode.INVALID_ADDRESS
			);
		}

		// Don't retry on network errors that are likely permanent
		if (error.name === 'TypeError' && error.message.includes('fetch')) {
			return false; // Allow retry for network errors
		}

		return false;
	}

	/**
	 * Delay utility for retry logic
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
