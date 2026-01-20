/**
 * @fileoverview Bitcoin Swap Status API
 *
 * This endpoint provides status information for Bitcoin on-chain swaps,
 * including Bitcoin transaction confirmation status and Starknet claim progress.
 *
 * @requires @atomiqlabs/sdk - Atomiq cross-chain swap SDK
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

/**
 * Bitcoin swap status response
 */
interface BitcoinSwapStatusResponse {
	swapId: string;
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
	progress: number;
	bitcoinTxHash?: string;
	bitcoinConfirmations?: number;
	starknetTxHash?: string;
	amountReceived?: number;
	errorMessage?: string;
	timestamp: string;
}

/**
 * Get Bitcoin swap status
 *
 * GET /api/bitcoin/swap-status/{swapId}
 *
 * Returns the current status of a Bitcoin on-chain swap including:
 * - Bitcoin transaction status and confirmations
 * - Starknet claim status and transaction hash
 * - Overall swap progress and any error messages
 *
 * @param swapId - The unique identifier for the Bitcoin swap
 * @returns 200 - Swap status retrieved successfully
 * @returns 404 - Swap not found
 * @returns 500 - Internal server error
 */
const getBitcoinSwapStatusHandler: RequestHandler = async ({ params }) => {
	const { swapId } = params;

	if (!swapId) {
		return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Swap ID is required', {
			field: 'swapId'
		});
	}

	logger.info('Getting Bitcoin swap status', { swapId });

	try {
		// Get swap status from atomiq service
		const statusUpdate = await getAtomiqService().getSwapStatus(swapId);

		if (!statusUpdate) {
			return createErrorResponse(ApiErrorCode.NOT_FOUND, 'Bitcoin swap not found', { swapId });
		}

		const response: BitcoinSwapStatusResponse = {
			swapId: statusUpdate.swapId,
			status: statusUpdate.status,
			progress: statusUpdate.progress,
			bitcoinTxHash: statusUpdate.txHash, // Will be Bitcoin tx hash
			bitcoinConfirmations: undefined, // Could be added if SDK provides this
			starknetTxHash: undefined, // Could be added for claim transaction
			amountReceived: statusUpdate.amountReceived,
			errorMessage: statusUpdate.errorMessage,
			timestamp: statusUpdate.timestamp.toISOString()
		};

		logger.info('Bitcoin swap status retrieved successfully', {
			swapId,
			status: response.status,
			progress: response.progress
		});

		return createSuccessResponse(response, {
			requestId: crypto.randomUUID()
		});
	} catch (error) {
		logger.error('Failed to get Bitcoin swap status', error as Error, {
			swapId
		});

		return createErrorResponse(
			ApiErrorCode.INTERNAL_ERROR,
			'Failed to retrieve Bitcoin swap status',
			{ swapId, originalError: (error as Error).message }
		);
	}
};

export const GET = withErrorHandling(getBitcoinSwapStatusHandler, '/api/bitcoin/swap-status');
