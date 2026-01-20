/**
 * @fileoverview Price Cache Management
 *
 * Handles in-memory caching of price data with TTL support,
 * cache cleanup, and statistics tracking.
 *
 * @author bim
 * @version 1.0.0
 */

import { CACHE_TTL } from '$lib/constants';
import { logger } from '$lib/utils/logger';
import type { CacheEntry, CacheStats, PriceData, SupportedAsset } from './types';

/**
 * Price cache management service
 */
export class CacheManager {
	private cache = new Map<string, CacheEntry>();
	private readonly defaultTTL = CACHE_TTL.PRICING;

	constructor() {
		// Start cache cleanup interval
		setInterval(() => this.cleanupCache(), 60000); // Clean every minute
	}

	/**
	 * Get cached price data
	 */
	get(asset: SupportedAsset): PriceData | null {
		const cacheKey = `price_${asset}`;
		const cached = this.cache.get(cacheKey);

		// Return cached data if still valid
		if (cached && Date.now() - cached.timestamp < cached.ttl) {
			return cached.data;
		}

		return null;
	}

	/**
	 * Get stale cached data (even if expired)
	 */
	getStale(asset: SupportedAsset): PriceData | null {
		const cacheKey = `price_${asset}`;
		const cached = this.cache.get(cacheKey);
		return cached ? cached.data : null;
	}

	/**
	 * Set price data in cache
	 */
	set(asset: SupportedAsset, priceData: PriceData, ttl?: number): void {
		const cacheKey = `price_${asset}`;

		this.cache.set(cacheKey, {
			data: priceData,
			timestamp: Date.now(),
			ttl: ttl || this.defaultTTL
		});
	}

	/**
	 * Check if cached data exists and is valid
	 */
	isValid(asset: SupportedAsset): boolean {
		const cacheKey = `price_${asset}`;
		const cached = this.cache.get(cacheKey);

		return cached ? Date.now() - cached.timestamp < cached.ttl : false;
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		let cleanedCount = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			logger.info(`Cleaned ${cleanedCount} expired price cache entries`);
		}
	}

	/**
	 * Clear all cached prices
	 */
	clear(): void {
		this.cache.clear();
		logger.info('Price cache cleared');
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		const now = Date.now();
		const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
			key,
			asset: entry.data.asset,
			age: now - entry.timestamp,
			ttl: entry.ttl,
			source: entry.data.source
		}));

		return {
			size: this.cache.size,
			entries
		};
	}

	/**
	 * Get cache size
	 */
	size(): number {
		return this.cache.size;
	}
}
