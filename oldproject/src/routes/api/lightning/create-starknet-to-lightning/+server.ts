/**
 * @fileoverview Starknet to Lightning Swap API Endpoint
 *
 * This endpoint handles the creation of Starknet to Lightning Network swaps
 * using the Atomiq SDK. Users can send Starknet assets and receive Bitcoin
 * via Lightning Network.
 *
 * Key Features:
 * - Creates reverse swaps from Starknet assets to Lightning BTC
 * - Returns Starknet address for payment
 * - Provides estimated output and fees
 * - Handles validation and error cases
 *
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/server/services/atomiq.service - Atomiq service
 * @requires $lib/utils/api-response - API response utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import { getSupportedAssets } from '$lib/services/server/atomiq/atomiq-assets';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Request body for creating Starknet to Lightning swap
 */
interface CreateStarknetToLightningRequest {
	sourceAsset: 'WBTC';
	starknetAddress: string; // Starknet address to send assets from
	lightningAddress: string; // Lightning address/invoice to receive BTC
	amountInSats?: number; // Amount to send in satoshis (optional if invoice has amount)
	expirationMinutes?: number;
}

/**
 * Response for Starknet to Lightning swap creation
 */
interface CreateStarknetToLightningResponse {
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

/**
 * Create Starknet to Lightning swap
 */
const createStarknetToLightningHandler = async (event: RequestEvent): Promise<Response> => {
	try {
		const body: CreateStarknetToLightningRequest = await event.request.json();

		// Validate required fields
		if (!body.sourceAsset) {
			return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Source asset is required', {
				sourceAsset: body.sourceAsset
			});
		}

		if (!body.starknetAddress) {
			return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Starknet address is required', {
				starknetAddress: body.starknetAddress
			});
		}

		if (!body.lightningAddress) {
			return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Lightning address is required', {
				lightningAddress: body.lightningAddress
			});
		}

		// Smart amount validation - handle both invoice with amount and amount-less scenarios
		let finalAmountInSats: number;
		let amountSource: 'invoice' | 'user' = 'user';

		// Try to decode Lightning invoice to check for embedded amount
		if (
			body.lightningAddress.toLowerCase().startsWith('lnbc') ||
			body.lightningAddress.toLowerCase().startsWith('lntb')
		) {
			try {
				const { decodeLightningInvoice, validateInvoiceForPayment } = await import(
					'$lib/utils/lightning-invoice'
				);
				const decoded = await decodeLightningInvoice(body.lightningAddress.trim());

				if (decoded?.isValid) {
					const validation = validateInvoiceForPayment(decoded, body.amountInSats);

					if (!validation.valid) {
						return createErrorResponse(
							ApiErrorCode.VALIDATION_ERROR,
							validation.error || 'Invalid Lightning invoice',
							{
								lightningAddress: body.lightningAddress.substring(0, 20) + '...',
								validationError: validation.error
							}
						);
					}

					if (validation.finalAmount) {
						finalAmountInSats = validation.finalAmount;
						amountSource = validation.amountSource || 'user';
					} else {
						throw new Error('No final amount resolved from validation');
					}
				} else {
					return createErrorResponse(
						ApiErrorCode.VALIDATION_ERROR,
						'Invalid Lightning invoice format',
						{ lightningAddress: body.lightningAddress.substring(0, 20) + '...' }
					);
				}
			} catch (error) {
				logger.error('Failed to decode Lightning invoice', error as Error);
				return createErrorResponse(
					ApiErrorCode.VALIDATION_ERROR,
					'Failed to process Lightning invoice',
					{
						error: error instanceof Error ? error.message : 'Unknown error',
						lightningAddress: body.lightningAddress.substring(0, 20) + '...'
					}
				);
			}
		} else {
			// Not a BOLT11 invoice - require user-provided amount
			if (!body.amountInSats || body.amountInSats <= 0) {
				return createErrorResponse(
					ApiErrorCode.VALIDATION_ERROR,
					'Amount in sats is required and must be greater than 0',
					{ amountInSats: body.amountInSats }
				);
			}
			finalAmountInSats = body.amountInSats;
		}

		// Validate source asset
		const supportedAssets = await getSupportedAssets();
		if (!supportedAssets.includes(body.sourceAsset)) {
			return createErrorResponse(
				ApiErrorCode.VALIDATION_ERROR,
				`Unsupported source asset: ${body.sourceAsset}. Supported assets: ${supportedAssets.join(', ')}`,
				{ sourceAsset: body.sourceAsset, supportedAssets }
			);
		}

		// Validate Lightning address format (basic validation)
		if (
			!body.lightningAddress.includes('@') &&
			!body.lightningAddress.startsWith('lnbc') &&
			!body.lightningAddress.startsWith('lno1')
		) {
			return createErrorResponse(
				ApiErrorCode.VALIDATION_ERROR,
				'Invalid Lightning address format. Please provide a valid Lightning address, invoice, or offer.',
				{ lightningAddress: body.lightningAddress }
			);
		}

		// Set default expiration if not provided
		const expirationMinutes = body.expirationMinutes || 15;

		logger.info('Creating Starknet to Lightning swap', {
			sourceAsset: body.sourceAsset,
			starknetAddress: body.starknetAddress.substring(0, 10) + '...',
			lightningAddress: body.lightningAddress.substring(0, 20) + '...',
			amountInSats: finalAmountInSats,
			amountSource,
			expirationMinutes
		});

		// Create Starknet to Lightning swap with Atomiq SDK with timeout protection
		const swapResponse = await Promise.race([
			getAtomiqService().createStarknetToLightningSwap({
				sourceAsset: body.sourceAsset,
				starknetAddress: body.starknetAddress,
				lightningAddress: body.lightningAddress,
				amountInSats: finalAmountInSats,
				expirationMinutes
			}),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Swap creation timed out after 90 seconds')), 90000)
			)
		]);

		const response: CreateStarknetToLightningResponse = {
			swapId: swapResponse.swapId,
			starknetAddress: swapResponse.starknetAddress,
			estimatedOutput: swapResponse.estimatedOutput,
			fees: {
				network: swapResponse.fees.fixed,
				swap: Math.floor(swapResponse.fees.total - swapResponse.fees.fixed),
				total: swapResponse.fees.total
			},
			expiresAt: swapResponse.expiresAt.toISOString(),
			status: swapResponse.status
		};

		logger.info('Starknet to Lightning swap created successfully', {
			swapId: response.swapId,
			sourceAsset: body.sourceAsset,
			estimatedOutput: response.estimatedOutput,
			fees: response.fees
		});

		return createSuccessResponse(response, {
			timestamp: new Date().toISOString(),
			requestId: crypto.randomUUID()
		});
	} catch (error) {
		logger.error('Failed to create Starknet to Lightning swap', error as Error);

		// Handle timeout errors specifically
		if (error instanceof Error && error.message.includes('timed out')) {
			return createErrorResponse(
				ApiErrorCode.TIMEOUT,
				'Swap creation timed out. Please try again.',
				{
					originalError: error.message,
					suggestion:
						'The operation is taking longer than expected. Please try again in a few moments.'
				}
			);
		}

		// Re-throw to let the error handler deal with it
		throw error;
	}
};

export const POST = withErrorHandling(
	createStarknetToLightningHandler,
	'/api/lightning/create-starknet-to-lightning'
);
