/**
 * @fileoverview Bitcoin On-Chain Swap Creation API
 *
 * This endpoint creates Bitcoin on-chain swaps for Bitcoin to Starknet
 * asset swaps using the Atomiq SDK. Unlike Lightning swaps that use invoices,
 * Bitcoin swaps provide a Bitcoin address for users to send funds to.
 *
 * @requires @atomiqlabs/sdk - Atomiq cross-chain swap SDK
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import { lightningLimits } from '$lib/services/server/lightning-limits.service';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	validateRequestBody,
	validators,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

/**
 * Bitcoin swap creation request body
 */
interface CreateBitcoinSwapRequest {
	amount: number; // Amount in satoshis
	starknetAddress: string; // Destination Starknet address
	destinationAsset?: string; // Asset to receive (default: WBTC)
	expirationMinutes?: number; // Swap expiration (default: 15)
}

/**
 * Bitcoin swap response
 */
interface CreateBitcoinSwapResponse {
	swapId: string;
	bitcoinAddress: string; // Address for user to send Bitcoin to
	amount: number; // Exact amount in satoshis
	bip21Uri: string; // BIP-21 URI for QR code generation
	expiresAt: string;
	estimatedOutput: number;
	fees: {
		fixed: number;
		swap: number;
		total: number;
	};
}

/**
 * Create Bitcoin on-chain swap
 *
 * POST /api/bitcoin/create-swap
 *
 * Creates a Bitcoin on-chain swap that provides a Bitcoin address for the user
 * to send funds to. Once confirmed on-chain, the swap will automatically
 * convert to the specified Starknet asset and send to the destination address.
 *
 * @param request.body - Bitcoin swap creation parameters
 * @returns 200 - Bitcoin swap created successfully
 * @returns 400 - Invalid request parameters
 * @returns 422 - Validation errors
 * @returns 500 - Internal server error
 */
const createBitcoinSwapHandler: RequestHandler = async ({ request }) => {
	const body: CreateBitcoinSwapRequest = await request.json();

	// Validate request body
	const validationErrors = validateRequestBody(body, ['amount', 'starknetAddress'], {
		amount: validators.positiveNumber,
		starknetAddress: validators.starknetAddress,
		destinationAsset: body.destinationAsset ? validators.supportedAsset : undefined,
		expirationMinutes: body.expirationMinutes ? validators.range(1, 60) : undefined
	});

	if (validationErrors.length > 0) {
		return createErrorResponse(
			ApiErrorCode.VALIDATION_ERROR,
			'Request validation failed',
			undefined,
			validationErrors
		);
	}

	// Set defaults
	const destinationAsset = body.destinationAsset || 'WBTC';
	const expirationMinutes = body.expirationMinutes || 15;

	// Validate amount against dynamic limits
	try {
		await lightningLimits.validateAmount(body.amount, destinationAsset);
	} catch (error) {
		logger.warn('Amount validation failed', {
			amount: body.amount,
			destinationAsset,
			error
		});
		return createErrorResponse(
			ApiErrorCode.INVALID_AMOUNT,
			error.message || 'Amount is outside allowed limits',
			{
				amount: body.amount,
				destinationAsset,
				validationSource: 'lightning_limits'
			}
		);
	}

	logger.info('Creating Bitcoin on-chain swap', {
		amount: body.amount,
		starknetAddress: body.starknetAddress,
		destinationAsset,
		expirationMinutes
	});

	// Create Bitcoin swap with Atomiq SDK
	const swapResponse = await getAtomiqService().createBitcoinSwap({
		amountSats: body.amount,
		destinationAsset,
		starknetAddress: body.starknetAddress,
		expirationMinutes
	});

	const response: CreateBitcoinSwapResponse = {
		swapId: swapResponse.swapId,
		bitcoinAddress: swapResponse.bitcoinAddress,
		amount: swapResponse.amount,
		bip21Uri: swapResponse.bip21Uri,
		expiresAt: swapResponse.expiresAt.toISOString(),
		estimatedOutput: swapResponse.estimatedOutput,
		fees: {
			fixed: swapResponse.fees.fixed,
			swap: Math.floor(swapResponse.fees.total - swapResponse.fees.fixed),
			total: swapResponse.fees.total
		}
	};

	logger.info('Bitcoin swap created successfully', {
		swapId: response.swapId,
		amount: body.amount,
		estimatedOutput: response.estimatedOutput,
		fees: response.fees
	});

	return createSuccessResponse(response, {
		requestId: crypto.randomUUID()
	});
};

export const POST = withErrorHandling(createBitcoinSwapHandler, '/api/bitcoin/create-swap');
