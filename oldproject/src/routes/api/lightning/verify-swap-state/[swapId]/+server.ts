/**
 * @fileoverview Verify Swap State API
 *
 * This endpoint verifies the current state of a Lightning swap to ensure
 * it's ready for the next phase (e.g., ready for claim after commit).
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Swap state verification response
 */
interface SwapStateVerificationResponse {
	success: boolean;
	message: string;
	swapId: string;
	state: number;
	readyForClaim: boolean;
	stateDescription: string;
}

/**
 * Verify swap state and readiness for next phase
 *
 * GET /api/lightning/verify-swap-state/[swapId]
 *
 * @param params.swapId - Unique swap identifier
 * @returns 200 - State verification completed
 * @returns 400 - Invalid request or swap not found
 * @returns 500 - Internal server error
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { swapId } = params;

		if (!swapId) {
			return json(
				{
					success: false,
					message: 'Swap ID is required',
					swapId: '',
					state: -1,
					readyForClaim: false,
					stateDescription: 'Invalid request'
				} as SwapStateVerificationResponse,
				{ status: 400 }
			);
		}

		logger.info('Verifying swap state', { swapId });

		// Get the swap state from the Atomiq service
		const result = await getAtomiqService().getSwapState(swapId);

		if (!result.success) {
			logger.warn('Swap state verification failed', {
				swapId,
				message: result.message
			});

			return json(
				{
					success: false,
					message: result.message,
					swapId,
					state: -1,
					readyForClaim: false,
					stateDescription: 'Unknown'
				} as SwapStateVerificationResponse,
				{ status: 400 }
			);
		}

		// Determine state description and readiness
		const state = result.state || 0;
		let stateDescription = 'Unknown';
		let readyForClaim = false;

		// Lightning swap states based on Atomiq SDK documentation
		switch (state) {
			case 0:
				stateDescription = 'Created';
				readyForClaim = false;
				break;
			case 1:
				stateDescription = 'Pending';
				readyForClaim = false;
				break;
			case 2:
				stateDescription = 'Committed';
				readyForClaim = true; // Ready for claim phase
				break;
			case 3:
				stateDescription = 'Claimed';
				readyForClaim = false; // Already claimed
				break;
			case 4:
				stateDescription = 'Completed';
				readyForClaim = false;
				break;
			case -1:
				stateDescription = 'Expired';
				readyForClaim = false;
				break;
			default:
				stateDescription = `State ${state}`;
				readyForClaim = state === 2; // Committed state
		}

		logger.info('Swap state verification completed', {
			swapId,
			state,
			stateDescription,
			readyForClaim
		});

		return json({
			success: true,
			message: `Swap state verified: ${stateDescription}`,
			swapId,
			state,
			readyForClaim,
			stateDescription
		} as SwapStateVerificationResponse);
	} catch (error) {
		logger.error('Error during swap state verification', error as Error, {
			swapId: params.swapId
		});

		return json(
			{
				success: false,
				message: 'Internal error during state verification',
				swapId: params.swapId || '',
				state: -1,
				readyForClaim: false,
				stateDescription: 'Error'
			} as SwapStateVerificationResponse,
			{ status: 500 }
		);
	}
};
