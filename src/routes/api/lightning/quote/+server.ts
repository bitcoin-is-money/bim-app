/**
 * @fileoverview Lightning Swap Quote API
 *
 * This endpoint provides price quotes for Lightning Bitcoin to Starknet
 * asset swaps using the Atomiq SDK. It calculates the estimated output
 * amount and fees for a given input amount.
 *
 * @requires @atomiqlabs/sdk - Atomiq cross-chain swap SDK
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import {
	serverPricingService,
	type SupportedAsset,
	type PriceData
} from '$lib/services/server/pricing.service';
import { lightningLimits } from '$lib/services/server/lightning-limits.service';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	validateQueryParams,
	validators,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

/**
 * Quote response
 */
interface QuoteResponse {
	inputAmount: number; // Amount in satoshis
	estimatedOutput: number; // Estimated output in destination asset
	exchangeRate: number; // Current exchange rate
	fees: {
		network: number; // Network fees in satoshis
		swap: number; // Swap fees in satoshis
		total: number; // Total fees in satoshis
	};
	priceImpact: number; // Price impact percentage
	minimumOutput: number; // Minimum guaranteed output
	validUntil: string; // Quote expiration time
}

/**
 * Swap quote interface
 */
interface SwapQuote {
	inputAmount: number;
	estimatedOutput: number;
	exchangeRate: number;
	priceImpact: number;
	fees: {
		network: number;
		swap: number;
		total: number;
	};
}

/**
 * Default swap configuration
 */
const SWAP_CONFIG = {
	networkFeeRate: 0.001, // 0.1%
	swapFeeRate: 0.005, // 0.5%
	largeTradePriceImpact: 0.1, // 10%
	smallTradePriceImpact: 0.05, // 5%
	largeTradeThreshold: 10000000 // 10M sats
};

/**
 * Calculate swap quote for Lightning to Starknet asset
 */
function calculateSwapQuote(amountSats: number, destinationAssetPrice: PriceData): SwapQuote {
	// Calculate fees
	const networkFee = Math.floor(amountSats * SWAP_CONFIG.networkFeeRate);
	const swapFee = Math.floor(amountSats * SWAP_CONFIG.swapFeeRate);
	const totalFees = networkFee + swapFee;

	// Calculate output amount
	const btcAmount = (amountSats - totalFees) / 100000000; // Convert to BTC after fees
	const estimatedOutput = btcAmount / destinationAssetPrice.btcPrice;

	// Calculate price impact (higher for larger amounts)
	const priceImpact =
		amountSats > SWAP_CONFIG.largeTradeThreshold
			? SWAP_CONFIG.largeTradePriceImpact
			: SWAP_CONFIG.smallTradePriceImpact;

	return {
		inputAmount: amountSats,
		estimatedOutput,
		exchangeRate: destinationAssetPrice.btcPrice,
		priceImpact,
		fees: {
			network: networkFee,
			swap: swapFee,
			total: totalFees
		}
	};
}

/**
 * Get Bitcoin swap quote (Lightning and On-chain)
 *
 * GET /api/lightning/quote?amount=<satoshis>&asset=<asset>&method=<lightning|bitcoin>
 *
 * Returns a price quote for swapping Bitcoin (Lightning or on-chain) to the specified
 * Starknet asset, including estimated output amount and fees. The same pricing
 * applies to both Lightning and Bitcoin on-chain swaps.
 *
 * @query amount - Amount in satoshis
 * @query asset - Destination asset (WBTC, STRK, ETH)
 * @query method - Payment method (lightning, bitcoin) - optional, defaults to lightning
 * @returns 200 - Quote retrieved successfully
 * @returns 400 - Invalid parameters
 * @returns 422 - Validation errors
 * @returns 500 - Internal server error
 */
const getQuoteHandler: RequestHandler = async ({ url }) => {
	// Validate query parameters
	const validationErrors = validateQueryParams(url.searchParams, ['amount'], {
		amount: validators.positiveNumber,
		asset: validators.supportedAsset,
		method: (value: string) => {
			if (value && !['lightning', 'bitcoin'].includes(value)) {
				return 'Payment method must be "lightning" or "bitcoin"';
			}
			return null;
		}
	});

	if (validationErrors.length > 0) {
		return createErrorResponse(
			ApiErrorCode.VALIDATION_ERROR,
			'Query parameter validation failed',
			undefined,
			validationErrors
		);
	}

	const amount = parseInt(url.searchParams.get('amount')!);
	const asset = (url.searchParams.get('asset') || 'WBTC') as SupportedAsset;
	const method = url.searchParams.get('method') || 'lightning';

	// Validate amount against dynamic limits
	try {
		await lightningLimits.validateAmount(amount, asset);
	} catch (error) {
		logger.warn('Amount validation failed', { amount, asset, error });
		return createErrorResponse(
			ApiErrorCode.INVALID_AMOUNT,
			error.message || 'Amount is outside allowed limits',
			{
				amount,
				asset,
				validationSource: 'lightning_limits'
			}
		);
	}

	logger.info('Fetching swap quote', { amount, asset, method });

	// Get current price for destination asset
	const assetPrice = await serverPricingService.getPrice(asset);

	// Calculate swap quote using server-side logic
	const quote = calculateSwapQuote(amount, assetPrice);

	// Calculate minimum output with slippage protection
	const minimumOutput = quote.estimatedOutput * (1 - quote.priceImpact / 100);

	// Quote valid for 30 seconds
	const validUntil = new Date(Date.now() + 30000);

	const response: QuoteResponse = {
		inputAmount: quote.inputAmount,
		estimatedOutput: quote.estimatedOutput,
		exchangeRate: quote.exchangeRate,
		fees: quote.fees,
		priceImpact: quote.priceImpact,
		minimumOutput,
		validUntil: validUntil.toISOString()
	};

	logger.info('Quote retrieved successfully', {
		amount,
		asset,
		method,
		estimatedOutput: response.estimatedOutput,
		totalFees: response.fees.total
	});

	return createSuccessResponse(response, {
		requestId: crypto.randomUUID()
	});
};

export const GET = withErrorHandling(getQuoteHandler, '/api/lightning/quote');
