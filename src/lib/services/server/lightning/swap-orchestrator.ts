/**
 * @fileoverview Lightning Swap Orchestrator
 *
 * Handles Starknet to Lightning swap orchestration and management.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import { ErrorHandlers, LightningError } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { CircuitBreakerUtils } from '$lib/utils/network/circuit-breaker/utils';
import { getAtomiqService } from '../atomiq';

export interface StarknetToLightningSwap {
	swapId: string;
	starknetAddress: string; // Address to send Starknet assets to
	amount: number;
	estimatedOutput: number; // Estimated BTC output in satoshis
	fees: {
		network: number;
		swap: number;
		total: number;
	};
	expiresAt: Date;
	sourceAsset: string;
	lightningAddress: string;
}

export interface CreateStarknetToLightningSwapOptions {
	amount: number;
	sourceAsset: 'WBTC';
	lightningAddress: string;
	starknetAddress?: string; // Optional, will use default if not provided
	expirationMinutes?: number;
}

export class LightningSwapOrchestrator {
	/**
	 * Create a Starknet to Lightning swap
	 *
	 * Creates a swap where users send Starknet assets and receive Bitcoin
	 * via Lightning Network. Returns a Starknet address for payment.
	 *
	 * @param options - Swap creation options
	 * @returns Promise resolving to swap data
	 *
	 * @example
	 * ```typescript
	 * const swap = await swapOrchestrator.createStarknetToLightningSwap({
	 *   amount: 1000000000000000000, // 1 ETH in wei
	 *   sourceAsset: 'ETH',
	 *   lightningAddress: 'user@lightning.com'
	 * });
	 * ```
	 */
	async createStarknetToLightningSwap(
		options: CreateStarknetToLightningSwapOptions
	): Promise<StarknetToLightningSwap> {
		try {
			logger.info('Creating Starknet to Lightning swap', {
				amount: options.amount,
				sourceAsset: options.sourceAsset,
				lightningAddress: options.lightningAddress.substring(0, 20) + '...'
			});

			// Create Starknet to Lightning swap with Atomiq SDK
			const swapResponse = await CircuitBreakerUtils.executeLightningOperation(async () => {
				return await getAtomiqService().createStarknetToLightningSwap({
					sourceAsset: options.sourceAsset,
					starknetAddress:
						options.starknetAddress ||
						'0x0000000000000000000000000000000000000000000000000000000000000000', // Default address
					lightningAddress: options.lightningAddress,
					expirationMinutes: options.expirationMinutes || 15
				});
			}, 'create-starknet-to-lightning-swap');

			const starknetToLightningSwap: StarknetToLightningSwap = {
				swapId: swapResponse.swapId,
				starknetAddress: swapResponse.starknetAddress,
				amount: options.amount,
				estimatedOutput: swapResponse.estimatedOutput,
				fees: {
					network: swapResponse.fees.fixed,
					swap: Math.floor(swapResponse.fees.total - swapResponse.fees.fixed),
					total: swapResponse.fees.total
				},
				expiresAt: swapResponse.expiresAt,
				sourceAsset: options.sourceAsset,
				lightningAddress: options.lightningAddress
			};

			logger.info('Starknet to Lightning swap created successfully', {
				swapId: swapResponse.swapId,
				amount: options.amount,
				sourceAsset: options.sourceAsset,
				estimatedOutput: swapResponse.estimatedOutput
			});

			monitoring.addBreadcrumb('Starknet to Lightning swap created', 'lightning', {
				swapId: swapResponse.swapId,
				amount: options.amount,
				sourceAsset: options.sourceAsset,
				estimatedOutput: swapResponse.estimatedOutput
			});

			return starknetToLightningSwap;
		} catch (error) {
			if (error instanceof LightningError) {
				throw error;
			}

			const lightningError = ErrorHandlers.fromUnknownError(error, {
				operation: 'createStarknetToLightningSwap',
				amount: options.amount,
				sourceAsset: options.sourceAsset,
				lightningAddress: options.lightningAddress
			});

			logger.error('Failed to create Starknet to Lightning swap', lightningError);
			throw lightningError;
		}
	}
}
