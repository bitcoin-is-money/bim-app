/**
 * @fileoverview Lightning Invoice Creation API
 *
 * This endpoint creates Lightning Network invoices for Bitcoin to Starknet
 * asset swaps using the Atomiq SDK. It handles the complete process of
 * generating Lightning invoices that when paid will automatically swap
 * the received Bitcoin to the specified Starknet asset.
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
 * Lightning invoice creation request body
 */
interface CreateInvoiceRequest {
	amount: number; // Amount in satoshis
	starknetAddress: string; // Destination Starknet address
	destinationAsset?: string; // Asset to receive (default: WBTC)
	expirationMinutes?: number; // Invoice expiration (default: 15)
}

/**
 * Lightning invoice response
 */
interface CreateInvoiceResponse {
	swapId: string;
	invoice: string;
	hyperlink: string; // QR code data from SDK getHyperlink() method
	expiresAt: string;
	estimatedOutput: number;
	fees: {
		network: number;
		swap: number;
		total: number;
	};
}

/**
 * Create Lightning invoice for Bitcoin to Starknet swap
 *
 * POST /api/lightning/create-invoice
 *
 * Creates a Lightning Network invoice that when paid will automatically
 * swap the received Bitcoin to the specified Starknet asset and send
 * it to the provided Starknet address.
 *
 * @param request.body - Invoice creation parameters
 * @returns 200 - Invoice created successfully
 * @returns 400 - Invalid request parameters
 * @returns 422 - Validation errors
 * @returns 500 - Internal server error
 */
const createInvoiceHandler: RequestHandler = async ({ request }) => {
	const body: CreateInvoiceRequest = await request.json();

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

	logger.info('Creating Lightning invoice', {
		amount: body.amount,
		starknetAddress: body.starknetAddress,
		destinationAsset,
		expirationMinutes
	});

	// Create Lightning swap with Atomiq SDK
	const swapResponse = await getAtomiqService().createLightningToStarknetSwap({
		amountSats: body.amount,
		destinationAsset,
		starknetAddress: body.starknetAddress,
		expirationMinutes
	});

	const response: CreateInvoiceResponse = {
		swapId: swapResponse.swapId,
		invoice: swapResponse.invoice,
		hyperlink: swapResponse.hyperlink, // Include hyperlink data from SDK
		expiresAt: swapResponse.expiresAt.toISOString(),
		estimatedOutput: swapResponse.estimatedOutput,
		fees: {
			network: swapResponse.fees.fixed,
			swap: Math.floor(swapResponse.fees.total - swapResponse.fees.fixed),
			total: swapResponse.fees.total
		}
	};

	logger.info('Lightning invoice created successfully', {
		swapId: response.swapId,
		amount: body.amount,
		estimatedOutput: response.estimatedOutput,
		fees: response.fees
	});

	return createSuccessResponse(response, {
		requestId: crypto.randomUUID()
	});
};

export const POST = withErrorHandling(createInvoiceHandler, '/api/lightning/create-invoice');
