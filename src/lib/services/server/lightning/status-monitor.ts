/**
 * @fileoverview Lightning Status Monitor
 *
 * Handles Lightning swap status monitoring and real-time updates.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import { ErrorHandlers, LightningError, LightningErrors } from '$lib/errors/lightning';
import type { SwapStatus } from '$lib/types/lightning';
import { logger } from '$lib/utils/logger';
import { CircuitBreakerUtils } from '$lib/utils/network/circuit-breaker/utils';
import { getAtomiqService } from '../atomiq';
import { SWAP_STATE_MAP } from '../atomiq/types';

export class LightningStatusMonitor {
	private swapperInitialized = false;
	private baseUrl: string;

	constructor(baseUrl: string = '/api/lightning') {
		this.baseUrl = baseUrl;
	}

	/**
	 * Initialize the service
	 */
	async initialize(): Promise<void> {
		this.swapperInitialized = true;
		logger.info('Lightning Status Monitor initialized');
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<boolean> {
		return this.swapperInitialized;
	}

	/**
	 * Set initialization status
	 */
	setInitialized(initialized: boolean): void {
		this.swapperInitialized = initialized;
	}

	/**
	 * Get current swap status from Atomiq API
	 *
	 * Fetches the current status of a Lightning to Starknet swap
	 * including payment progress and completion status.
	 *
	 * @param swapId - Unique swap identifier
	 * @returns Promise resolving to current swap status
	 */
	async getSwapStatus(swapId: string): Promise<SwapStatus> {
		try {
			if (!swapId) {
				throw LightningErrors.validationError(
					'SwapId is required',
					'Swap ID is required to check status',
					{ swapId }
				);
			}

			// Ensure service is initialized
			if (!this.swapperInitialized) {
				throw LightningErrors.serviceUnavailable();
			}

			logger.debug('🔍 LightningStatusMonitor.getSwapStatus - delegating to atomiqService', {
				swapId
			});

			// Delegate to the atomiqService which uses SwapMonitorService internally
			// This ensures we get the proper paid status tracking from background monitoring
			const swapStatusUpdate = await CircuitBreakerUtils.executeLightningOperation(async () => {
				return getAtomiqService().getSwapStatus(swapId);
			}, 'get-swap-status');

			// Handle null status
			if (!swapStatusUpdate) {
				throw LightningErrors.validationError(
					'Swap not found or expired',
					'Swap could not be retrieved. The swap may have expired or been cancelled.',
					{ swapId }
				);
			}

			logger.debug('✅ LightningStatusMonitor received status from atomiqService', {
				swapId,
				status: swapStatusUpdate.status,
				progress: swapStatusUpdate.progress
			});

			// Convert SwapStatusUpdate to SwapStatus format
			const swapStatus: SwapStatus = {
				swapId: swapStatusUpdate.swapId,
				status: swapStatusUpdate.status,
				progress: swapStatusUpdate.progress,
				amountReceived: swapStatusUpdate.amountReceived,
				txHash: swapStatusUpdate.txHash,
				errorMessage: swapStatusUpdate.errorMessage,
				updatedAt: swapStatusUpdate.timestamp,
				timestamp: swapStatusUpdate.timestamp.toISOString()
			};

			logger.debug('✅ LightningStatusMonitor returning converted status', {
				swapId,
				status: swapStatus.status,
				progress: swapStatus.progress
			});

			return swapStatus;
		} catch (error) {
			if (error instanceof LightningError) {
				throw error;
			}

			const lightningError = ErrorHandlers.fromUnknownError(error, {
				operation: 'getSwapStatus',
				swapId
			});

			logger.error('Failed to get swap status', lightningError);
			throw lightningError;
		}
	}

	/**
	 * Maps SDK swap state to human-readable status
	 */
	private mapSwapState(swapState: number): SwapStatus['status'] {
		// Convert number to string for lookup
		const stateKey = swapState.toString() as keyof typeof SWAP_STATE_MAP;
		return (SWAP_STATE_MAP as any)[stateKey] || 'pending';
	}

	/**
	 * Calculates progress percentage based on status
	 */
	private calculateProgress(status: SwapStatus['status']): number {
		switch (status) {
			case 'pending':
				return 10;
			case 'waiting_payment':
				return 25;
			case 'paid':
				return 50;
			case 'confirming':
				return 75;
			case 'completed':
				return 100;
			case 'failed':
			case 'expired':
				return 0;
			default:
				return 0;
		}
	}

	/**
	 * Monitor swap status with real-time polling
	 *
	 * Sets up periodic polling to monitor swap progress and calls
	 * the provided callback with status updates.
	 *
	 * @param swapId - Unique swap identifier
	 * @param onStatusUpdate - Callback called with each status update
	 * @param pollingInterval - Polling interval in milliseconds (default: 3000)
	 * @returns Function to stop monitoring
	 *
	 * @example
	 * ```typescript
	 * const stopMonitoring = statusMonitor.monitorSwapStatus(
	 *   swapId,
	 *   (status) => {
	 *     console.log('Swap status:', status);
	 *     if (status.status === 'completed') {
	 *       console.log('Payment completed!');
	 *     }
	 *   }
	 * );
	 * ```
	 */
	monitorSwapStatus(
		swapId: string,
		onStatusUpdate: (status: SwapStatus) => void,
		pollingInterval: number = 3000
	): () => void {
		let isMonitoring = true;

		const pollStatus = async () => {
			if (!isMonitoring) return;

			try {
				const status = await this.getSwapStatus(swapId);
				onStatusUpdate(status);

				// Stop monitoring if swap is completed, failed, or expired
				if (['completed', 'failed', 'expired'].includes(status.status)) {
					isMonitoring = false;
					return;
				}

				// Schedule next poll
				setTimeout(pollStatus, pollingInterval);
			} catch (error) {
				console.error('Error polling swap status:', error);

				// Retry with exponential backoff
				const retryDelay = Math.min(pollingInterval * 2, 30000);
				setTimeout(pollStatus, retryDelay);
			}
		};

		// Start polling
		pollStatus();

		// Return stop function
		return () => {
			isMonitoring = false;
		};
	}

	/**
	 * Start Server-Sent Events connection for real-time updates
	 *
	 * Establishes a connection to the webhook SSE endpoint for
	 * real-time status updates instead of polling.
	 *
	 * @param swapId - Unique swap identifier
	 * @param onStatusUpdate - Callback called with each status update
	 * @returns Function to stop monitoring
	 */
	monitorSwapStatusSSE(swapId: string, onStatusUpdate: (status: SwapStatus) => void): () => void {
		let eventSource: EventSource | null = null;

		try {
			// Create SSE connection
			eventSource = new EventSource(`${this.baseUrl}/webhook?swapId=${swapId}`);

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					// Handle different event types
					switch (data.type) {
						case 'connection':
							console.log('SSE connection established for swap:', swapId);
							break;

						case 'status_update':
							// Convert webhook data to SwapStatus format
							const status: SwapStatus = {
								swapId: data.swapId,
								status: data.status,
								progress: data.progress,
								txHash: data.txHash,
								errorMessage: data.errorMessage,
								updatedAt: new Date(data.timestamp)
							};

							onStatusUpdate(status);
							break;

						case 'heartbeat':
							// Keep connection alive
							break;

						default:
							console.warn('Unknown SSE event type:', data.type);
					}
				} catch (error) {
					console.error('Failed to parse SSE message:', error);
				}
			};

			eventSource.onerror = (error) => {
				console.error('SSE connection error:', error);

				// Fallback to polling if SSE fails
				eventSource?.close();
				eventSource = null;

				// Start polling as fallback
				return this.monitorSwapStatus(swapId, onStatusUpdate);
			};

			eventSource.onopen = () => {
				console.log('SSE connection opened for swap:', swapId);
			};
		} catch (error) {
			console.error('Failed to establish SSE connection:', error);

			// Fallback to polling
			return this.monitorSwapStatus(swapId, onStatusUpdate);
		}

		// Return cleanup function
		return () => {
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
		};
	}

	/**
	 * Update swap status (used by webhook system)
	 *
	 * Updates the status of a swap based on webhook notifications.
	 * This method is called by the webhook handler to maintain
	 * synchronized status information.
	 *
	 * @param swapId - Unique swap identifier
	 * @param statusUpdate - Status update data
	 * @returns Promise resolving to update success
	 */
	async updateSwapStatus(
		swapId: string,
		statusUpdate: {
			status: string;
			progress: number;
			txHash?: string;
			errorMessage?: string;
			timestamp: string;
		}
	): Promise<boolean> {
		try {
			// For now, this is a placeholder for webhook status updates
			// In a real implementation, this would update a cache or database
			console.log(`Swap ${swapId} status updated:`, statusUpdate);

			// You could implement a local cache here for better performance
			// or emit events for real-time UI updates

			return true;
		} catch (error) {
			console.error('Failed to update swap status:', error);
			return false;
		}
	}
}
