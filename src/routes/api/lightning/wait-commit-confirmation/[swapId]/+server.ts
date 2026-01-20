/**
 * @fileoverview Wait for Commit Confirmation API
 *
 * This endpoint properly handles commit confirmation using Atomiq SDK's
 * waitTillCommitted() method as specified in the official documentation.
 *
 * According to Atomiq docs:
 * "After sending the transactions, you also need to make sure the SDK has
 * enough time to receive an event notification of the transaction being executed,
 * for this you have the waitTill(action) functions, e.g.: commit() -> waitTillCommitted()"
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Wait for commit confirmation response
 */
interface WaitCommitConfirmationResponse {
	success: boolean;
	message: string;
	swapId: string;
	finalState?: number;
	confirmedAt: string;
}

/**
 * Wait for commit confirmation using proper Atomiq SDK methods
 *
 * POST /api/lightning/wait-commit-confirmation/[swapId]
 *
 * Calls swap.waitTillCommitted() to properly handle transaction event
 * notifications as required by the Atomiq SDK documentation.
 *
 * @param params.swapId - Unique swap identifier
 * @returns 200 - Commit confirmation completed
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
				} as WaitCommitConfirmationResponse,
				{ status: 400 }
			);
		}

		logger.info('Starting Atomiq SDK commit confirmation wait', { swapId });

		// Call the backend service that properly uses swap.waitTillCommitted()
		const result = await getAtomiqService().waitForCommitConfirmation(swapId);

		if (!result.success) {
			logger.warn('Commit confirmation failed or timed out', {
				swapId,
				message: result.message
			});

			return json(
				{
					success: false,
					message: result.message,
					swapId,
					confirmedAt: new Date().toISOString()
				} as WaitCommitConfirmationResponse,
				{ status: 400 }
			);
		}

		logger.info('Atomiq SDK commit confirmation completed successfully', {
			swapId,
			finalState: result.finalState
		});

		return json({
			success: true,
			message: result.message,
			swapId,
			finalState: result.finalState,
			confirmedAt: new Date().toISOString()
		} as WaitCommitConfirmationResponse);
	} catch (error) {
		logger.error('Error during commit confirmation wait', error as Error, {
			swapId: params.swapId
		});

		return json(
			{
				success: false,
				message: 'Internal error during commit confirmation',
				swapId: params.swapId || '',
				confirmedAt: new Date().toISOString()
			} as WaitCommitConfirmationResponse,
			{ status: 500 }
		);
	}
};
