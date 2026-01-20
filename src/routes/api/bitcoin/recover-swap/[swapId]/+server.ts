/**
 * @fileoverview Bitcoin Swap Recovery API
 *
 * This endpoint allows manual recovery of Bitcoin swaps that expired
 * but have confirmed Starknet deposit transactions. Used to handle
 * cases where Atomiq's swap expired prematurely but user funds were deposited.
 *
 * @requires @atomiqlabs/sdk - Atomiq cross-chain swap SDK
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { json } from '@sveltejs/kit';
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
 * Bitcoin swap recovery response
 */
interface BitcoinSwapRecoveryResponse {
	swapId: string;
	recovered: boolean;
	previousStatus: string;
	newStatus: string;
	depositConfirmed: boolean;
	actionTaken: 'retry_swap' | 'mark_deposit_confirmed' | 'no_action';
	message: string;
	timestamp: string;
}

/**
 * Attempt to recover a Bitcoin swap that may have expired prematurely
 *
 * POST /api/bitcoin/recover-swap/{swapId}
 *
 * This endpoint attempts to recover Bitcoin swaps that:
 * - Are marked as 'expired' but may have confirmed deposits
 * - Have Starknet transactions that were confirmed after expiration
 * - Need manual intervention due to timing issues
 *
 * @param swapId - The unique identifier for the Bitcoin swap
 * @returns 200 - Recovery attempt completed (check 'recovered' field)
 * @returns 401 - Authentication required
 * @returns 404 - Swap not found
 * @returns 400 - Swap not eligible for recovery
 * @returns 500 - Internal server error
 */
const recoverBitcoinSwapHandler: RequestHandler = async ({ params, locals }) => {
	const { swapId } = params;

	// Check authentication
	if (!locals.user) {
		return createErrorResponse(
			ApiErrorCode.UNAUTHORIZED,
			'Authentication required to recover Bitcoin swaps',
			{ endpoint: 'bitcoin/recover-swap', swapId }
		);
	}

	if (!swapId) {
		return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Swap ID is required', {
			field: 'swapId'
		});
	}

	logger.info('Attempting Bitcoin swap recovery', { swapId });

	try {
		const atomiqService = getAtomiqService();

		// Get current swap status
		const currentStatus = atomiqService.getSwapStatus(swapId);
		if (!currentStatus) {
			return createErrorResponse(ApiErrorCode.NOT_FOUND, 'Bitcoin swap not found', { swapId });
		}

		logger.info('Current swap status for recovery', {
			swapId,
			status: currentStatus.status,
			progress: currentStatus.progress
		});

		// Check if swap is eligible for recovery
		const isEligible = currentStatus.status === 'expired' || currentStatus.status === 'failed';
		if (!isEligible) {
			return createErrorResponse(
				ApiErrorCode.VALIDATION_ERROR,
				`Swap is not eligible for recovery. Current status: ${currentStatus.status}`,
				{
					swapId,
					currentStatus: currentStatus.status,
					eligibleStatuses: ['expired', 'failed']
				}
			);
		}

		// Get the actual swap object from registry
		const swapObject = atomiqService.getSwap(swapId);
		if (!swapObject) {
			return createErrorResponse(ApiErrorCode.NOT_FOUND, 'Swap object not found in registry', {
				swapId
			});
		}

		const previousStatus = currentStatus.status;
		let recovered = false;
		let actionTaken: BitcoinSwapRecoveryResponse['actionTaken'] = 'no_action';
		let newStatus = previousStatus;
		let depositConfirmed = false;

		try {
			// Check current swap state from SDK
			const swapState = swapObject.getState();
			logger.info('Bitcoin swap recovery - SDK state check', {
				swapId,
				swapState,
				previousStatus
			});

			// If swap state is -1 (soft expired), try to mark deposit as confirmed
			// and let the background monitoring handle it
			if (swapState === -1) {
				logger.info('Marking Bitcoin swap deposit as confirmed for recovery', {
					swapId,
					swapState,
					action: 'mark_deposit_confirmed'
				});

				// Mark deposit as confirmed in monitoring service
				const monitorService = (atomiqService as any).services?.swapMonitorService;
				if (monitorService) {
					monitorService.markDepositConfirmed(swapId);
					depositConfirmed = true;
					actionTaken = 'mark_deposit_confirmed';

					// Re-check status after marking deposit
					const updatedStatus = atomiqService.getSwapStatus(swapId);
					if (updatedStatus && updatedStatus.status !== previousStatus) {
						newStatus = updatedStatus.status;
						recovered = true;
						logger.info('Bitcoin swap recovered after marking deposit confirmed', {
							swapId,
							previousStatus,
							newStatus
						});
					}
				}
			} else if (swapState > 0) {
				// Swap has progressed - it's already recovered
				recovered = true;
				actionTaken = 'no_action';
				newStatus = 'pending'; // Or appropriate status based on state

				logger.info('Bitcoin swap already recovered - progressed beyond initial state', {
					swapId,
					swapState,
					previousStatus,
					newStatus
				});
			}

			const response: BitcoinSwapRecoveryResponse = {
				swapId,
				recovered,
				previousStatus,
				newStatus,
				depositConfirmed,
				actionTaken,
				message: recovered
					? 'Swap recovery successful - monitoring will continue'
					: 'Swap recovery attempted but not successful - manual intervention may be required',
				timestamp: new Date().toISOString()
			};

			logger.info('Bitcoin swap recovery completed', {
				swapId,
				recovered,
				actionTaken,
				previousStatus,
				newStatus,
				depositConfirmed
			});

			return createSuccessResponse(response, {
				requestId: crypto.randomUUID()
			});
		} catch (recoveryError) {
			logger.error('Error during Bitcoin swap recovery process', recoveryError as Error, {
				swapId,
				previousStatus
			});

			const response: BitcoinSwapRecoveryResponse = {
				swapId,
				recovered: false,
				previousStatus,
				newStatus: previousStatus,
				depositConfirmed: false,
				actionTaken: 'no_action',
				message: `Recovery failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`,
				timestamp: new Date().toISOString()
			};

			return createSuccessResponse(response, {
				requestId: crypto.randomUUID()
			});
		}
	} catch (error) {
		logger.error('Failed to recover Bitcoin swap', error as Error, {
			swapId
		});

		return createErrorResponse(ApiErrorCode.INTERNAL_ERROR, 'Failed to recover Bitcoin swap', {
			swapId,
			originalError: (error as Error).message
		});
	}
};

// Export both GET and POST for debugging - GET will just return method info
const debugHandler: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return createErrorResponse(ApiErrorCode.UNAUTHORIZED, 'Authentication required', {
			endpoint: 'bitcoin/recover-swap',
			swapId: params.swapId
		});
	}

	return createSuccessResponse({
		endpoint: 'bitcoin/recover-swap',
		swapId: params.swapId,
		message: 'Recovery endpoint is active. Use POST method to attempt recovery.',
		availableMethods: ['POST']
	});
};

export const GET = withErrorHandling(debugHandler, '/api/bitcoin/recover-swap');

export const POST: RequestHandler = async ({ params, locals }) => {
	const { swapId } = params;

	try {
		// Check authentication
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!swapId) {
			return json({ error: 'Swap ID is required' }, { status: 400 });
		}

		logger.info('Attempting Bitcoin swap recovery', { swapId });

		const atomiqService = getAtomiqService();

		// Get current swap status
		const currentStatus = atomiqService.getSwapStatus(swapId);

		// Add debug info about what services are available
		logger.info('AtomiqService debug info', {
			swapId,
			hasSwapStatus: !!currentStatus,
			availableServices: Object.keys((atomiqService as any).services || {}),
			swapRegistryAvailable: !!(atomiqService as any).services?.swapRegistry
		});

		if (!currentStatus) {
			// Try to check if swap exists directly in Atomiq SDK (bypass our registry)
			logger.warn('Swap not found in local registry, checking if it exists in Atomiq backend', {
				swapId
			});

			return json(
				{
					error: 'Bitcoin swap not found in local monitoring system',
					details:
						'This swap may have been created before the monitoring system was active. It might exist in Atomiq but not in our local registry.',
					swapId,
					suggestion:
						'Try creating a new Bitcoin swap to test the improved flow, or contact support for manual recovery of this specific swap.'
				},
				{ status: 404 }
			);
		}

		logger.info('Current swap status for recovery', {
			swapId,
			status: currentStatus.status,
			progress: currentStatus.progress
		});

		// Check if swap is eligible for recovery
		const isEligible = currentStatus.status === 'expired' || currentStatus.status === 'failed';
		if (!isEligible) {
			return json(
				{
					error: `Swap is not eligible for recovery. Current status: ${currentStatus.status}`,
					currentStatus: currentStatus.status,
					eligibleStatuses: ['expired', 'failed']
				},
				{ status: 400 }
			);
		}

		// Get the actual swap object from registry
		const swapObject = atomiqService.getSwap(swapId);
		if (!swapObject) {
			return json({ error: 'Swap object not found in registry' }, { status: 404 });
		}

		const previousStatus = currentStatus.status;
		let recovered = false;
		let actionTaken = 'no_action';
		let newStatus = previousStatus;
		let depositConfirmed = false;

		// Check current swap state from SDK
		const swapState = swapObject.getState();
		logger.info('Bitcoin swap recovery - SDK state check', {
			swapId,
			swapState,
			previousStatus
		});

		// If swap state is -1 (soft expired), try to mark deposit as confirmed
		if (swapState === -1) {
			logger.info('Marking Bitcoin swap deposit as confirmed for recovery', {
				swapId,
				swapState,
				action: 'mark_deposit_confirmed'
			});

			// Mark deposit as confirmed in monitoring service
			const monitorService = (atomiqService as any).services?.swapMonitorService;
			if (monitorService) {
				monitorService.markDepositConfirmed(swapId);
				depositConfirmed = true;
				actionTaken = 'mark_deposit_confirmed';

				// Re-check status after marking deposit
				const updatedStatus = atomiqService.getSwapStatus(swapId);
				if (updatedStatus && updatedStatus.status !== previousStatus) {
					newStatus = updatedStatus.status;
					recovered = true;
				}
			}
		} else if (swapState > 0) {
			// Swap has progressed - it's already recovered
			recovered = true;
			actionTaken = 'no_action';
			newStatus = 'pending';
		}

		const response = {
			swapId,
			recovered,
			previousStatus,
			newStatus,
			depositConfirmed,
			actionTaken,
			message: recovered
				? 'Swap recovery successful - monitoring will continue'
				: 'Swap recovery attempted but not successful - manual intervention may be required',
			timestamp: new Date().toISOString()
		};

		logger.info('Bitcoin swap recovery completed', {
			swapId,
			recovered,
			actionTaken,
			previousStatus,
			newStatus,
			depositConfirmed
		});

		return json(response);
	} catch (error) {
		logger.error('Failed to recover Bitcoin swap', error as Error, { swapId });
		return json(
			{
				error: 'Failed to recover Bitcoin swap',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
