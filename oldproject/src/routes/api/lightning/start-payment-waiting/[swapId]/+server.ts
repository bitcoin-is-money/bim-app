/**
 * @fileoverview Start Payment Waiting API for Starknet-to-Lightning Swaps
 *
 * This endpoint starts background payment waiting for Starknet-to-Lightning swaps
 * after the commit phase is completed. This should only be called when the swap
 * is in COMMITED state (state 1).
 *
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Start payment waiting response
 */
interface StartPaymentWaitingResponse {
	success: boolean;
	message: string;
	swapId: string;
	startedAt: string;
}

/**
 * Start background payment waiting for Starknet-to-Lightning swap
 *
 * POST /api/lightning/start-payment-waiting/[swapId]
 *
 * Starts background payment waiting for a Starknet-to-Lightning swap after
 * the commit phase is completed. This should only be called when the swap
 * is in COMMITED state (state 1).
 *
 * @param params.swapId - Unique swap identifier
 * @returns 200 - Payment waiting started successfully
 * @returns 400 - Swap not in COMMITED state or invalid request
 * @returns 404 - Swap not found
 * @returns 500 - Internal server error
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const { swapId } = params;

		if (!swapId) {
			return json(
				{
					success: false,
					message: 'Swap ID is required'
				} as StartPaymentWaitingResponse,
				{ status: 400 }
			);
		}

		logger.info('Starting payment waiting for Starknet-to-Lightning swap', {
			swapId
		});

		// Start payment waiting after commit
		const result = await getAtomiqService().startPaymentWaitingAfterCommit(swapId);

		if (!result.success) {
			logger.warn('Failed to start payment waiting', {
				swapId,
				message: result.message
			});

			return json(
				{
					success: false,
					message: result.message,
					swapId,
					startedAt: new Date().toISOString()
				} as StartPaymentWaitingResponse,
				{ status: 400 }
			);
		}

		logger.info('Successfully started payment waiting for Starknet-to-Lightning swap', {
			swapId
		});

		return json({
			success: true,
			message: result.message,
			swapId,
			startedAt: new Date().toISOString()
		} as StartPaymentWaitingResponse);
	} catch (error) {
		logger.error('Error starting payment waiting for Starknet-to-Lightning swap', error as Error, {
			swapId: params.swapId
		});

		return json(
			{
				success: false,
				message: 'Internal server error while starting payment waiting',
				swapId: params.swapId || 'unknown',
				startedAt: new Date().toISOString()
			} as StartPaymentWaitingResponse,
			{ status: 500 }
		);
	}
};
