/**
 * @fileoverview Swap Registry for Atomiq Service
 *
 * This registry manages active swaps across all specialized services,
 * providing centralized access and lifecycle management.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import type { SwapDirection } from './types';

/**
 * Information about a registered swap
 */
interface SwapInfo {
	swapId: string;
	swap: any; // The SDK swap object
	direction: SwapDirection;
	createdAt: Date;
	lastAccessedAt: Date;
}

/**
 * Registry for managing active swaps
 */
export class SwapRegistry {
	private static instance: SwapRegistry;
	private swaps: Map<string, SwapInfo> = new Map();
	private cleanupInterval: NodeJS.Timeout | null = null;

	private constructor() {
		// Start cleanup interval to remove expired swaps
		this.startCleanupInterval();
		logger.info('SwapRegistry initialized');
	}

	/**
	 * Gets the singleton instance
	 */
	static getInstance(): SwapRegistry {
		if (!SwapRegistry.instance) {
			SwapRegistry.instance = new SwapRegistry();
		}
		return SwapRegistry.instance;
	}

	/**
	 * Registers a new swap
	 */
	registerSwap(swapId: string, swap: any, direction: SwapDirection): void {
		const swapInfo: SwapInfo = {
			swapId,
			swap,
			direction,
			createdAt: new Date(),
			lastAccessedAt: new Date()
		};

		this.swaps.set(swapId, swapInfo);

		logger.info('Registered swap in registry', {
			swapId,
			direction,
			totalSwaps: this.swaps.size
		});
	}

	/**
	 * Gets a swap by ID
	 */
	getSwap(swapId: string): any | null {
		const swapInfo = this.swaps.get(swapId);

		if (!swapInfo) {
			return null;
		}

		// Update last accessed time
		swapInfo.lastAccessedAt = new Date();

		logger.debug('Retrieved swap from registry', {
			swapId,
			direction: swapInfo.direction
		});

		return swapInfo.swap;
	}

	/**
	 * Gets swap info (including metadata)
	 */
	getSwapInfo(swapId: string): SwapInfo | null {
		const swapInfo = this.swaps.get(swapId);

		if (swapInfo) {
			swapInfo.lastAccessedAt = new Date();
		}

		return swapInfo || null;
	}

	/**
	 * Removes a swap from the registry
	 */
	removeSwap(swapId: string): boolean {
		const removed = this.swaps.delete(swapId);

		if (removed) {
			logger.info('Removed swap from registry', {
				swapId,
				remainingSwaps: this.swaps.size
			});
		}

		return removed;
	}

	/**
	 * Gets all active swap IDs
	 */
	getActiveSwapIds(): string[] {
		return Array.from(this.swaps.keys());
	}

	/**
	 * Gets swaps by direction
	 */
	getSwapsByDirection(direction: SwapDirection): SwapInfo[] {
		return Array.from(this.swaps.values()).filter((info) => info.direction === direction);
	}

	/**
	 * Gets the count of active swaps
	 */
	getSwapCount(): number {
		return this.swaps.size;
	}

	/**
	 * Gets the count of swaps by direction
	 */
	getSwapCountByDirection(): Record<SwapDirection, number> {
		const counts = {
			lightning_to_starknet: 0,
			bitcoin_to_starknet: 0,
			starknet_to_lightning: 0,
			starknet_to_bitcoin: 0
		} as Record<SwapDirection, number>;

		for (const swapInfo of this.swaps.values()) {
			counts[swapInfo.direction]!++;
		}

		return counts;
	}

	/**
	 * Checks if a swap exists
	 */
	hasSwap(swapId: string): boolean {
		return this.swaps.has(swapId);
	}

	/**
	 * Starts the cleanup interval to remove old swaps
	 */
	private startCleanupInterval(): void {
		// Clean up every 5 minutes
		this.cleanupInterval = setInterval(
			() => {
				this.cleanupExpiredSwaps();
			},
			5 * 60 * 1000
		);
	}

	/**
	 * Cleans up expired swaps
	 */
	private cleanupExpiredSwaps(): void {
		const now = new Date();
		const expiredSwapIds: string[] = [];

		for (const [swapId, swapInfo] of this.swaps.entries()) {
			// Remove swaps that haven't been accessed in the last 4 hours
			const timeSinceLastAccess = now.getTime() - swapInfo.lastAccessedAt.getTime();
			const fourHoursInMs = 4 * 60 * 60 * 1000;

			if (timeSinceLastAccess > fourHoursInMs) {
				expiredSwapIds.push(swapId);
			}
		}

		if (expiredSwapIds.length > 0) {
			logger.info('Cleaning up expired swaps', {
				expiredCount: expiredSwapIds.length,
				totalSwaps: this.swaps.size
			});

			for (const swapId of expiredSwapIds) {
				this.removeSwap(swapId);
			}
		}
	}

	/**
	 * Manually triggers cleanup
	 */
	cleanup(): void {
		logger.info('Manual cleanup triggered', {
			totalSwaps: this.swaps.size
		});

		this.cleanupExpiredSwaps();
	}

	/**
	 * Shuts down the registry
	 */
	shutdown(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}

		this.swaps.clear();
		logger.info('SwapRegistry shutdown completed');
	}

	/**
	 * Gets registry statistics
	 */
	getStats(): {
		totalSwaps: number;
		swapsByDirection: Record<SwapDirection, number>;
		oldestSwap?: { swapId: string; createdAt: Date };
		newestSwap?: { swapId: string; createdAt: Date };
	} {
		const swapInfos = Array.from(this.swaps.values());

		let oldestSwap: SwapInfo | undefined;
		let newestSwap: SwapInfo | undefined;

		for (const swapInfo of swapInfos) {
			if (!oldestSwap || swapInfo.createdAt < oldestSwap.createdAt) {
				oldestSwap = swapInfo;
			}
			if (!newestSwap || swapInfo.createdAt > newestSwap.createdAt) {
				newestSwap = swapInfo;
			}
		}

		return {
			totalSwaps: this.swaps.size,
			swapsByDirection: this.getSwapCountByDirection(),
			oldestSwap: oldestSwap
				? {
						swapId: oldestSwap.swapId,
						createdAt: oldestSwap.createdAt
					}
				: undefined,
			newestSwap: newestSwap
				? {
						swapId: newestSwap.swapId,
						createdAt: newestSwap.createdAt
					}
				: undefined
		};
	}
}
