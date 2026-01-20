/**
 * @fileoverview Lightning Swap Status API
 *
 * This endpoint provides real-time status updates for Lightning to Starknet
 * swaps created via the Atomiq SDK. It serves as a proxy to the Atomiq API
 * and provides detailed swap progress information.
 *
 * @requires @atomiqlabs/sdk - Atomiq cross-chain swap SDK
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/server/services/lightning.service - Lightning service
 *
 * @author bim
 * @version 2.0.0
 */

import { getLightningService } from '$lib/services/server/lightning.server.service';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Swap status response
 */
interface SwapStatusResponse {
	swapId: string;
	status: 'pending' | 'paid' | 'confirming' | 'completed' | 'failed' | 'expired';
	progress: number; // 0-100
	amountReceived?: number; // Satoshis received
	amountOut?: number; // Starknet asset amount
	txHash?: string; // Starknet transaction hash
	errorMessage?: string;
	createdAt: string;
	updatedAt: string;
	expiresAt?: string;
	details?: {
		confirmations?: number;
		requiredConfirmations?: number;
		estimatedCompletionTime?: string;
	};
}

/**
 * Get Lightning swap status
 *
 * GET /api/lightning/swap-status/[swapId]
 *
 * Returns the current status of a Lightning to Starknet swap including
 * payment progress, confirmation status, and completion details.
 *
 * @param params.swapId - Unique swap identifier
 * @returns 200 - Swap status retrieved successfully
 * @returns 404 - Swap not found
 * @returns 500 - Internal server error
 */
export const GET: RequestHandler = async ({ params }) => {
	const startTime = Date.now();

	try {
		const { swapId } = params;

		if (!swapId) {
			logger.warn('Missing swap ID in request', {
				params,
				timestamp: new Date().toISOString()
			});

			return json(
				{
					error: 'Missing swap ID',
					message: 'Swap ID is required'
				},
				{ status: 400 }
			);
		}

		logger.info('🔍 Starting swap status fetch', {
			swapId,
			requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date().toISOString()
		});

		// Validate swap ID format
		if (!swapId.match(/^[a-zA-Z0-9_-]+$/)) {
			logger.warn('Invalid swap ID format', {
				swapId,
				timestamp: new Date().toISOString()
			});

			return json(
				{
					error: 'Invalid swap ID format',
					message: 'Swap ID contains invalid characters'
				},
				{ status: 400 }
			);
		}

		logger.debug('📡 Fetching swap status from real Atomiq SDK', {
			swapId,
			timestamp: new Date().toISOString()
		});

		// Fetch real swap status from Atomiq SDK (will handle initialization internally)
		const swapStatus = await getLightningService().getSwapStatus(swapId);

		logger.debug('✅ Swap status retrieved from SDK', {
			swapId,
			status: swapStatus.status,
			progress: swapStatus.progress,
			hasTxHash: !!swapStatus.txHash,
			hasAmountReceived: !!swapStatus.amountReceived,
			timestamp: new Date().toISOString()
		});

		// Transform to API response format - preserve original status for better debugging
		const response: SwapStatusResponse = {
			swapId: swapStatus.swapId,
			status: swapStatus.status, // Keep original status instead of transforming waiting_payment to pending
			progress: swapStatus.progress,
			amountReceived: swapStatus.amountReceived,
			txHash: swapStatus.txHash,
			errorMessage: swapStatus.errorMessage,
			updatedAt: swapStatus.updatedAt?.toISOString() ?? new Date().toISOString(),
			createdAt: swapStatus.updatedAt?.toISOString() ?? new Date().toISOString(), // Using updatedAt as fallback
			expiresAt: new Date(
				(swapStatus.updatedAt?.getTime() ?? Date.now()) + 15 * 60 * 1000
			).toISOString() // 15 min from now
		};

		// Add details for confirming status
		if (swapStatus.status === 'confirming') {
			response.details = {
				confirmations: 1, // Mock for now
				requiredConfirmations: 3,
				estimatedCompletionTime: new Date(Date.now() + 60000).toISOString()
			};
		}

		const responseTime = Date.now() - startTime;

		logger.info('🎯 Swap status request completed successfully', {
			swapId,
			status: response.status,
			progress: response.progress,
			responseTime: `${responseTime}ms`,
			timestamp: new Date().toISOString()
		});

		return json(response);
	} catch (error) {
		logger.error('❌ Failed to fetch swap status', error as Error);

		// Handle specific error types
		if (error instanceof Error) {
			if (error.message.includes('not found') || error.message.includes('Swap not found')) {
				return json(
					{
						error: 'Swap not found',
						message: 'The specified swap could not be found. It may have expired or been cancelled.'
					},
					{ status: 404 }
				);
			}

			if (error.message.includes('timeout') || error.message.includes('timed out')) {
				return json(
					{
						error: 'Request timeout',
						message: 'The request timed out. Please try again.'
					},
					{ status: 408 }
				);
			}
		}

		return json(
			{
				error: 'Status fetch failed',
				message: 'Failed to retrieve swap status. Please try again.'
			},
			{ status: 500 }
		);
	}
};
