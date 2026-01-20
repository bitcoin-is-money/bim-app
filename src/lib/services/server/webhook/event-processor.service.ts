/**
 * @fileoverview Webhook Event Processing Service
 *
 * Handles processing of webhook events and status updates.
 */

import { logger } from '$lib/utils/logger';
import { getLightningService } from '$lib/services/server/lightning.server.service';
import { getAtomiqService } from '$lib/services/server/atomiq';
import { sseManagerService } from './sse-manager.service';
import type { WebhookPayload, WebhookEventType, SwapStatusUpdate, SSEUpdateData } from './types';

/**
 * Service for processing webhook events
 */
export class EventProcessorService {
	/**
	 * Process webhook event and update status
	 */
	async processEvent(payload: WebhookPayload): Promise<void> {
		const { event, swapId, data } = payload;

		try {
			// Map event to status and progress
			const statusUpdate = this.mapEventToStatus(event);
			if (!statusUpdate) {
				logger.warn(`Unknown webhook event type: ${event}`);
				return;
			}

			// Handle special cases based on event type
			await this.handleSpecialCases(event, swapId, statusUpdate);

			// Update Lightning service with new status
			await getLightningService().updateSwapStatus(swapId, {
				...statusUpdate,
				txHash: data.txHash,
				errorMessage: data.errorMessage,
				timestamp: new Date().toISOString()
			});

			// Send real-time update via SSE
			const updateData: SSEUpdateData = {
				type: 'status_update',
				swapId,
				status: statusUpdate.status,
				progress: statusUpdate.progress,
				txHash: data.txHash,
				error: data.errorMessage,
				timestamp: new Date().toISOString()
			};

			sseManagerService.sendUpdate(swapId, updateData);

			logger.info(`Webhook event processed: ${event}`, {
				swapId,
				status: statusUpdate.status,
				progress: statusUpdate.progress
			});
		} catch (error) {
			logger.error(`Failed to process webhook event: ${event}`, error as Error);
			throw error;
		}
	}

	/**
	 * Map webhook event to status and progress
	 */
	private mapEventToStatus(event: WebhookEventType): SwapStatusUpdate | null {
		const statusMap: Record<WebhookEventType, { status: string; progress: number }> = {
			invoice_created: { status: 'pending', progress: 10 },
			payment_received: { status: 'paid', progress: 30 },
			payment_confirmed: { status: 'confirming', progress: 50 },
			swap_initiated: { status: 'swapping', progress: 70 },
			swap_completed: { status: 'completed', progress: 100 },
			swap_failed: { status: 'failed', progress: 0 },
			swap_expired: { status: 'expired', progress: 0 }
		};

		const mapping = statusMap[event];
		if (!mapping) {
			return null;
		}

		return {
			status: mapping.status,
			progress: mapping.progress,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Handle special cases for specific events
	 */
	private async handleSpecialCases(
		event: WebhookEventType,
		swapId: string,
		statusUpdate: SwapStatusUpdate
	): Promise<void> {
		if (event === 'payment_received') {
			await this.handlePaymentReceived(swapId);
		}
	}

	/**
	 * Handle payment received event - trigger automatic claim
	 */
	private async handlePaymentReceived(swapId: string): Promise<void> {
		logger.info('Payment received, triggering automatic claim', { swapId });

		try {
			// Trigger claim in background - don't wait for completion
			atomiqService
				.claimLightningSwap(swapId)
				.then((result) => {
					if (result.success) {
						logger.info('Automatic claim completed successfully', {
							swapId,
							txHash: result.txHash
						});

						// Send claim completion update via SSE
						const updateData: SSEUpdateData = {
							type: 'claim_completed',
							swapId,
							txHash: result.txHash,
							status: 'completed',
							progress: 100,
							timestamp: new Date().toISOString()
						};

						sseManagerService.sendUpdate(swapId, updateData);
					} else {
						logger.warn('Automatic claim failed', {
							swapId,
							message: result.message
						});

						// Send claim failure update via SSE
						const updateData: SSEUpdateData = {
							type: 'claim_failed',
							swapId,
							error: result.message,
							status: 'failed',
							timestamp: new Date().toISOString()
						};

						sseManagerService.sendUpdate(swapId, updateData);
					}
				})
				.catch((error) => {
					logger.error('Automatic claim process failed', error as Error, {
						swapId
					});

					// Send claim error update via SSE
					const updateData: SSEUpdateData = {
						type: 'claim_error',
						swapId,
						error: (error as Error).message,
						status: 'failed',
						timestamp: new Date().toISOString()
					};

					sseManagerService.sendUpdate(swapId, updateData);
				});
		} catch (error) {
			logger.error('Failed to start automatic claim process', error as Error, {
				swapId
			});
		}
	}

	/**
	 * Validate webhook payload
	 */
	validatePayload(payload: WebhookPayload): { valid: boolean; error?: string } {
		if (!payload.event || !payload.swapId || !payload.timestamp) {
			return {
				valid: false,
				error: 'Missing required fields: event, swapId, timestamp'
			};
		}

		// Validate event type
		const validEvents: WebhookEventType[] = [
			'invoice_created',
			'payment_received',
			'payment_confirmed',
			'swap_initiated',
			'swap_completed',
			'swap_failed',
			'swap_expired'
		];

		if (!validEvents.includes(payload.event)) {
			return {
				valid: false,
				error: `Invalid event type: ${payload.event}`
			};
		}

		return { valid: true };
	}
}

// Export singleton instance
export const eventProcessorService = new EventProcessorService();
