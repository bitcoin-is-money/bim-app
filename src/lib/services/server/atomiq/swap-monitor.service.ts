/**
 * @fileoverview Swap Monitoring Service for Atomiq
 *
 * This service handles payment monitoring, status tracking, and background
 * processes for Lightning and Bitcoin swaps.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import {
	SWAP_STATE_MAP,
	mapSwapStateByDirection,
	type SwapStatusUpdate,
	type SwapDirection
} from './types';

/**
 * Service for monitoring swap status and payment confirmations
 */
export class SwapMonitorService {
	private activeSwaps: Map<string, any> = new Map();
	private paidSwaps: Set<string> = new Set(); // Track swaps where payment was received but claiming pending
	private swapRegistry: any; // Reference to swap registry for getting swap direction
	private depositTrackingSwaps: Map<string, { depositAddress: string; confirmedDeposit: boolean }> =
		new Map(); // Track Bitcoin swap deposits

	constructor(swapRegistry?: any) {
		this.swapRegistry = swapRegistry;
		// Initialize monitoring service
		logger.info('SwapMonitorService initialized');
	}

	/**
	 * Registers a swap for monitoring
	 */
	registerSwap(swapId: string, swap: any): void {
		this.activeSwaps.set(swapId, swap);
		logger.info('Registered swap for monitoring', { swapId });
	}

	/**
	 * Removes a swap from monitoring
	 */
	unregisterSwap(swapId: string): void {
		this.activeSwaps.delete(swapId);
		this.paidSwaps.delete(swapId);
		logger.info('Unregistered swap from monitoring', { swapId });
	}

	/**
	 * Gets the current status of a swap
	 */
	getSwapStatus(swapId: string): SwapStatusUpdate | null {
		const swap = this.activeSwaps.get(swapId);
		if (!swap) {
			logger.warn('Swap not found in activeSwaps', { swapId });
			return null;
		}

		try {
			// Debug: Log the current state of paid swaps
			logger.info('🔍 SwapMonitorService.getSwapStatus debug', {
				swapId,
				paidSwapsCount: this.paidSwaps.size,
				paidSwapsArray: Array.from(this.paidSwaps),
				swapIdInPaidSwaps: this.paidSwaps.has(swapId)
			});

			// First check if the swap has been marked as paid but not claimed
			// This takes priority over the raw SDK state
			const isPaid = this.isPaidButNotClaimed(swapId);
			logger.info('🔍 isPaidButNotClaimed check result', { swapId, isPaid });

			if (isPaid) {
				logger.info('✅ Swap marked as paid, returning paid status', {
					swapId
				});
				return {
					swapId,
					status: 'paid',
					progress: this.calculateProgress('paid'),
					timestamp: new Date()
				};
			}

			// If not marked as paid, get status from SDK state
			const swapState = swap.getState();

			// Get swap direction for accurate state mapping
			const swapInfo = this.swapRegistry?.getSwapInfo?.(swapId);
			const swapDirection = swapInfo?.direction as SwapDirection | undefined;

			let status = this.mapSwapState(swapState, swapDirection);

			// Special handling for Bitcoin swaps with deposit tracking
			if (swapDirection === 'starknet_to_bitcoin' && (status === 'expired' || swapState === -1)) {
				const depositInfo = this.depositTrackingSwaps.get(swapId);
				if (depositInfo?.confirmedDeposit) {
					logger.info('Bitcoin swap has confirmed deposit, overriding expired status', {
						swapId,
						originalStatus: status,
						swapState,
						depositInfo
					});
					// If we have confirmed deposit, consider it pending rather than expired
					status = 'pending';
				}
			}

			const progress = this.calculateProgress(status);

			logger.info('📊 Using SDK state for status', {
				swapId,
				swapState,
				swapDirection,
				mappedStatus: status,
				progress,
				hasDepositInfo: this.depositTrackingSwaps.has(swapId)
			});

			return {
				swapId,
				status,
				progress,
				timestamp: new Date()
				// Additional fields can be populated based on swap type
			};
		} catch (error) {
			logger.error('Failed to get swap status', error as Error, { swapId });
			return null;
		}
	}

	/**
	 * Checks if a swap has been paid but not yet claimed
	 */
	isPaidButNotClaimed(swapId: string): boolean {
		return this.paidSwaps.has(swapId);
	}

	/**
	 * Marks a swap as paid and ready for claiming
	 */
	markSwapAsPaid(swapId: string): void {
		logger.info('🏷️ Before marking swap as paid', {
			swapId,
			paidSwapsCount: this.paidSwaps.size,
			paidSwapsArray: Array.from(this.paidSwaps),
			swapIdAlreadyExists: this.paidSwaps.has(swapId)
		});

		this.paidSwaps.add(swapId);

		logger.info('✅ After marking swap as paid', {
			swapId,
			paidSwapsCount: this.paidSwaps.size,
			paidSwapsArray: Array.from(this.paidSwaps),
			swapIdNowExists: this.paidSwaps.has(swapId)
		});

		logger.info('Swap marked as paid and ready for claiming', { swapId });
	}

	/**
	 * Marks a swap as claimed (removes from paid tracking)
	 */
	markSwapAsClaimed(swapId: string): void {
		this.paidSwaps.delete(swapId);
		logger.info('Swap marked as claimed', { swapId });
	}

	/**
	 * Marks a swap as cancelled (removes from active and paid tracking)
	 */
	markSwapAsCancelled(swapId: string): void {
		this.activeSwaps.delete(swapId);
		this.paidSwaps.delete(swapId);
		this.depositTrackingSwaps.delete(swapId);
		logger.info('Swap marked as cancelled', { swapId });
	}

	/**
	 * Tracks deposit information for Bitcoin swaps
	 */
	trackBitcoinSwapDeposit(swapId: string, depositAddress: string): void {
		this.depositTrackingSwaps.set(swapId, {
			depositAddress,
			confirmedDeposit: false
		});
		logger.info('Started tracking Bitcoin swap deposit', {
			swapId,
			depositAddress: depositAddress.substring(0, 10) + '...'
		});
	}

	/**
	 * Marks a Bitcoin swap deposit as confirmed
	 */
	markDepositConfirmed(swapId: string): void {
		const depositInfo = this.depositTrackingSwaps.get(swapId);
		if (depositInfo) {
			depositInfo.confirmedDeposit = true;
			logger.info('Bitcoin swap deposit confirmed', { swapId });
		} else {
			logger.warn('Attempted to mark deposit as confirmed for non-tracked swap', { swapId });
		}
	}

	/**
	 * Starts background payment waiting process
	 * This method starts a background task that waits for Lightning payment
	 * and automatically updates swap status when payment is received
	 */
	startBackgroundPaymentWaiting(swap: any, swapId: string): void {
		// Start background payment waiting - don't await, let it run in background
		this.waitForPaymentBackground(swap, swapId).catch((error) => {
			logger.error('Background payment waiting failed', error as Error, {
				swapId,
				operation: 'startBackgroundPaymentWaiting'
			});
		});
	}

	/**
	 * Starts background deposit monitoring for Bitcoin swaps
	 * This monitors the swap for deposit confirmation and prevents premature expiration
	 */
	startBackgroundDepositMonitoring(swap: any, swapId: string, swapDirection: SwapDirection): void {
		// Start background deposit monitoring - don't await, let it run in background
		this.monitorDepositBackground(swap, swapId, swapDirection).catch((error) => {
			logger.error('Background deposit monitoring failed', error as Error, {
				swapId,
				swapDirection,
				operation: 'startBackgroundDepositMonitoring'
			});
		});
	}

	/**
	 * Background deposit monitoring implementation for Bitcoin swaps
	 * Monitors for deposit confirmation and prevents premature expiration
	 */
	private async monitorDepositBackground(
		swap: any,
		swapId: string,
		swapDirection: SwapDirection
	): Promise<void> {
		try {
			logger.info('Starting background deposit monitoring for Bitcoin swap', {
				swapId,
				swapDirection,
				swapState: swap.getState(),
				timestamp: new Date().toISOString()
			});

			// Monitor swap state changes and prevent premature expiration
			const monitoringStartTime = Date.now();
			const maxMonitoringTime = 15 * 60 * 1000; // 15 minutes max monitoring
			const pollInterval = 10 * 1000; // Poll every 10 seconds

			while (Date.now() - monitoringStartTime < maxMonitoringTime) {
				try {
					const currentState = swap.getState();

					logger.info('Bitcoin swap deposit monitoring - state check', {
						swapId,
						currentState,
						monitoringDuration: Date.now() - monitoringStartTime,
						timestamp: new Date().toISOString()
					});

					// Check if swap has progressed beyond initial states
					if (currentState > 0) {
						logger.info('Bitcoin swap progressed beyond initial state - deposit likely confirmed', {
							swapId,
							currentState,
							message: 'Swap is progressing normally, ending monitoring'
						});
						break;
					}

					// Check if swap failed permanently
					if (currentState < -2) {
						logger.warn('Bitcoin swap failed permanently during monitoring', {
							swapId,
							finalState: currentState,
							timestamp: new Date().toISOString()
						});
						break;
					}

					// If swap is in temporary error state (-1) or pending (0), continue monitoring
					await new Promise((resolve) => setTimeout(resolve, pollInterval));
				} catch (stateError) {
					logger.warn('Error checking swap state during monitoring', stateError as Error, {
						swapId,
						operation: 'monitorDepositBackground'
					});
					// Continue monitoring despite state check errors
					await new Promise((resolve) => setTimeout(resolve, pollInterval));
				}
			}

			logger.info('Background deposit monitoring completed for Bitcoin swap', {
				swapId,
				finalState: swap.getState(),
				monitoringDuration: Date.now() - monitoringStartTime,
				timestamp: new Date().toISOString()
			});
		} catch (error) {
			logger.error('Background deposit monitoring encountered error', error as Error, {
				swapId,
				swapDirection,
				operation: 'monitorDepositBackground',
				swapState: swap.getState?.()
			});
		}
	}

	/**
	 * Background payment waiting implementation
	 * Calls waitForPayment() once and handles the result
	 */
	private async waitForPaymentBackground(swap: any, swapId: string): Promise<void> {
		try {
			logger.info('Starting background payment waiting', {
				swapId,
				swapState: swap.getState(),
				timestamp: new Date().toISOString()
			});

			// Call waitForPayment() once - this will block until payment is received or times out
			const paymentSuccess = await swap.waitForPayment();

			logger.info('Background payment waiting completed', {
				swapId,
				paymentSuccess,
				finalState: swap.getState(),
				timestamp: new Date().toISOString()
			});

			if (paymentSuccess) {
				logger.info('Lightning payment received in background - marking swap as paid', {
					swapId,
					swapState: swap.getState()
				});

				// Mark the swap as paid and ready for manual claiming
				// We don't attempt automatic claiming because it requires user's WebAuthn signer
				try {
					// Update swap state to indicate payment was received
					const swapState = swap.getState();
					logger.info('Payment successfully received - swap ready for manual claiming', {
						swapId,
						swapState,
						message: 'Lightning payment detected - user can now claim tokens via UI'
					});

					// Store that payment was received for this swap
					this.markSwapAsPaid(swapId);

					logger.info('Swap marked as paid and ready for claiming', {
						swapId,
						timestamp: new Date().toISOString()
					});
				} catch (error) {
					logger.error('Failed to mark swap as paid', error as Error, {
						swapId,
						operation: 'waitForPaymentBackground'
					});
				}
			} else {
				logger.warn('Lightning payment not received within timeout', {
					swapId,
					swapState: swap.getState(),
					timestamp: new Date().toISOString()
				});
			}
		} catch (error) {
			logger.error('Background payment waiting encountered error', error as Error, {
				swapId,
				operation: 'waitForPaymentBackground',
				swapState: swap.getState?.()
			});
		}
	}

	/**
	 * Maps SDK swap state to human-readable status using direction-aware mapping
	 */
	private mapSwapState(
		swapState: number,
		swapDirection?: SwapDirection
	): SwapStatusUpdate['status'] {
		return mapSwapStateByDirection(swapState, swapDirection);
	}

	/**
	 * Calculates progress percentage based on status
	 */
	private calculateProgress(status: SwapStatusUpdate['status']): number {
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
	 * Gets all active swaps being monitored
	 */
	getActiveSwaps(): string[] {
		return Array.from(this.activeSwaps.keys());
	}

	/**
	 * Gets all paid but unclaimed swaps
	 */
	getPaidSwaps(): string[] {
		return Array.from(this.paidSwaps);
	}

	/**
	 * Cleanup method for graceful shutdown
	 */
	cleanup(): void {
		this.activeSwaps.clear();
		this.paidSwaps.clear();
		this.depositTrackingSwaps.clear();
		logger.info('SwapMonitorService cleanup completed');
	}
}
