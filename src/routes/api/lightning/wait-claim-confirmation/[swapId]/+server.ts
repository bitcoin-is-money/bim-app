/**
 * @fileoverview Wait for Claim Confirmation API
 *
 * This endpoint properly handles claim confirmation using Atomiq SDK's
 * waitTillClaimed() method as specified in the official documentation.
 *
 * According to Atomiq docs:
 * "After sending the transactions, you also need to make sure the SDK has
 * enough time to receive an event notification of the transaction being executed,
 * for this you have the waitTill(action) functions, e.g.: claim() -> waitTillClaimed()"
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Wait for claim confirmation response
 */
interface WaitClaimConfirmationResponse {
	success: boolean;
	message: string;
	swapId: string;
	finalState?: number;
	confirmedAt: string;
}

/**
 * Wait for claim confirmation using proper Atomiq SDK methods
 *
 * POST /api/lightning/wait-claim-confirmation/[swapId]
 *
 * Calls swap.waitTillClaimed() to properly handle transaction event
 * notifications as required by the Atomiq SDK documentation.
 *
 * @param params.swapId - Unique swap identifier
 * @returns 200 - Claim confirmation completed
 * @returns 400 - Invalid request or swap not found
 * @returns 500 - Internal server error
 */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const { swapId } = params;

		if (!swapId) {
			return json(
				{
					success: false,
					message: 'Swap ID is required',
					swapId: '',
					confirmedAt: new Date().toISOString()
				} as WaitClaimConfirmationResponse,
				{ status: 400 }
			);
		}

		logger.info('Starting Atomiq SDK claim confirmation wait', { swapId });

		// Call the backend service that properly uses swap.waitTillClaimed()
		const result = await getAtomiqService().waitForClaimConfirmation(swapId);

		if (!result.success) {
			logger.warn('Claim confirmation failed or timed out', {
				swapId,
				message: result.message
			});

			return json(
				{
					success: false,
					message: result.message,
					swapId,
					confirmedAt: new Date().toISOString()
				} as WaitClaimConfirmationResponse,
				{ status: 400 }
			);
		}

		logger.info('Atomiq SDK claim confirmation completed successfully', {
			swapId,
			finalState: result.finalState
		});

		return json({
			success: true,
			message: result.message,
			swapId,
			finalState: result.finalState,
			confirmedAt: new Date().toISOString()
		} as WaitClaimConfirmationResponse);
	} catch (error) {
		logger.error('Error during claim confirmation wait', error as Error, {
			swapId: params.swapId
		});

		return json(
			{
				success: false,
				message: 'Internal error during claim confirmation',
				swapId: params.swapId || '',
				confirmedAt: new Date().toISOString()
			} as WaitClaimConfirmationResponse,
			{ status: 500 }
		);
	}
};
