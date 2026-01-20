/**
 * @fileoverview Lightning Swap Status Service
 *
 * Handles Lightning swap status tracking and updates.
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import type { SwapStatus } from './types';

/**
 * Service for Lightning swap status operations
 */
export class SwapStatusService {
	private baseUrl: string;

	constructor(baseUrl: string = '/api/lightning') {
		this.baseUrl = baseUrl;
	}

	/**
	 * Get swap status for a Lightning swap
	 */
	async getSwapStatus(swapId: string): Promise<SwapStatus> {
		const startTime = Date.now();

		try {
			logger.info('Swap Status Service: Getting swap status', { swapId });

			const response = await fetch(`${this.baseUrl}/status/${swapId}`);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${await response.text()}`);
			}

			const result = await response.json();

			// Track success metrics
			monitoring.trackOperationTime('lightning_get_swap_status', Date.now() - startTime);

			return result;
		} catch (error) {
			monitoring.incrementCounter('lightning_swap_status_failed');
			logger.error('Swap Status Service: Swap status retrieval failed', error as Error, { swapId });
			throw error;
		}
	}

	/**
	 * Update swap status (used by webhooks)
	 */
	async updateSwapStatus(swapId: string, update: Partial<SwapStatus>): Promise<void> {
		try {
			logger.info('Swap Status Service: Updating swap status', {
				swapId,
				update
			});

			const response = await fetch(`${this.baseUrl}/status/${swapId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(update)
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${await response.text()}`);
			}
		} catch (error) {
			logger.error('Swap Status Service: Swap status update failed', error as Error, {
				swapId,
				update
			});
			throw error;
		}
	}
}

// Export singleton instance
export const swapStatusService = new SwapStatusService();
