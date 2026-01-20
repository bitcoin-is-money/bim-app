/**
 * @fileoverview Lightning Quote Service
 *
 * Handles Lightning swap quotes and pricing calculations.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import { ErrorHandlers, LightningError, LightningErrors } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import { CircuitBreakerUtils } from '$lib/utils/network/circuit-breaker/utils';
import { getAtomiqService } from '../atomiq';
import { getSupportedAssets } from '../atomiq-assets';
import { lightningLimits } from '../lightning-limits.service';

export class LightningQuoteService {
	/**
	 * Get estimated swap quote
	 *
	 * Gets an estimated quote for how much Starknet asset will be received
	 * for a given Lightning Bitcoin amount.
	 *
	 * @param amountSats - Amount in satoshis
	 * @param destinationAsset - Target asset on Starknet
	 * @returns Promise resolving to estimated output amount
	 */
	async getSwapQuote(amountSats: number, destinationAsset: string = 'WBTC'): Promise<number> {
		try {
			// Validate inputs with dynamic limits
			if (!amountSats || amountSats <= 0) {
				throw LightningErrors.invalidAmount(
					amountSats,
					1,
					1000000000 // 10 BTC max
				);
			}

			// Validate amount against dynamic limits
			await lightningLimits.validateAmount(amountSats, destinationAsset);

			const supportedAssets = await getSupportedAssets();
			if (!supportedAssets.includes(destinationAsset)) {
				throw LightningErrors.unsupportedAsset(destinationAsset, {
					supportedAssets
				});
			}

			logger.debug('Getting swap quote', { amountSats, destinationAsset });

			const quote = await CircuitBreakerUtils.executeLightningOperation(async () => {
				return await getAtomiqService().getQuote(amountSats, destinationAsset);
			}, 'get-swap-quote');

			// Validate the quote response structure
			if (!quote.success || !quote.quote) {
				throw LightningErrors.pricingFailed(destinationAsset);
			}

			const estimatedOutput = quote.quote.estimatedOutput;

			logger.debug('Swap quote retrieved', {
				amountSats,
				destinationAsset,
				estimatedOutput
			});

			return estimatedOutput;
		} catch (error) {
			if (error instanceof LightningError) {
				throw error;
			}

			const lightningError = ErrorHandlers.fromUnknownError(error, {
				operation: 'getSwapQuote',
				amountSats,
				destinationAsset
			});

			logger.error('Failed to get swap quote', lightningError);
			throw lightningError;
		}
	}

	/**
	 * Format satoshi amount for display
	 *
	 * Converts satoshi amount to user-friendly format
	 *
	 * @param sats - Amount in satoshis
	 * @returns Formatted string
	 */
	formatSatoshis(sats: number): string {
		if (sats >= 100000000) {
			return `${(sats / 100000000).toFixed(8)} BTC`;
		} else if (sats >= 1000) {
			return `${(sats / 1000).toFixed(0)}k sats`;
		} else {
			return `${sats} sats`;
		}
	}
}
