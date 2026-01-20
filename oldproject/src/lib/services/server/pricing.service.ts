/**
 * @fileoverview Server-side Pricing Service for Lightning Bitcoin Swaps
 *
 * This service handles real-time price fetching and caching for Lightning Bitcoin
 * to Starknet asset swaps in a server environment. It provides accurate exchange rates,
 * fee calculations, and health check capabilities.
 *
 * Key Features:
 * - Real-time price fetching from multiple sources
 * - In-memory price caching with configurable TTL
 * - Fallback price sources for reliability
 * - Health check capabilities for API monitoring
 * - Server-side environment variable support
 *
 * @requires $env/dynamic/private - Private environment variables (server-side)
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { env } from '$env/dynamic/private';
import { requireEnvironment, ServiceType } from '$lib/utils/environment';
import { logger } from '$lib/utils/logger';
import { CACHE_TTL } from '$lib/constants';

/**
 * Supported assets for Lightning swaps
 */
export type SupportedAsset = 'WBTC';

/**
 * Price data structure
 */
export interface PriceData {
	asset: SupportedAsset;
	usdPrice: number;
	btcPrice: number;
	lastUpdated: number;
	source: string;
}

/**
 * Price cache entry
 */
interface CacheEntry {
	data: PriceData;
	timestamp: number;
	ttl: number;
}

/**
 * External price API response formats
 */
interface CoinGeckoResponse {
	[key: string]: {
		usd: number;
		btc: number;
	};
}

/**
 * Cache statistics for health monitoring
 */
export interface CacheStats {
	size: number;
	entries: Array<{
		key: string;
		asset: SupportedAsset;
		age: number;
		isExpired: boolean;
	}>;
	hitRate: number;
	totalRequests: number;
	cacheHits: number;
}

/**
 * Server-side Pricing Service for Lightning Bitcoin Swaps
 *
 * Handles real-time price fetching, caching, and health monitoring for
 * Lightning Bitcoin to Starknet asset swaps in server environments.
 */
@requireEnvironment(ServiceType.SERVER)
export class ServerPricingService {
	private static instance: ServerPricingService;
	private cache = new Map<string, CacheEntry>();
	private readonly defaultTTL = CACHE_TTL.PRICING; // 5 minutes in milliseconds
	private stats = {
		totalRequests: 0,
		cacheHits: 0
	};

	private constructor() {
		// Start cache cleanup interval
		setInterval(() => this.cleanupCache(), 60000); // Clean every minute
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): ServerPricingService {
		if (!ServerPricingService.instance) {
			ServerPricingService.instance = new ServerPricingService();
		}
		return ServerPricingService.instance;
	}

	/**
	 * Get price for a specific asset
	 */
	async getPrice(asset: SupportedAsset): Promise<PriceData> {
		this.stats.totalRequests++;

		const cacheKey = `price_${asset}`;
		const cached = this.cache.get(cacheKey);

		// Return cached data if still valid
		if (cached && Date.now() - cached.timestamp < cached.ttl) {
			this.stats.cacheHits++;
			logger.debug(`Cache hit for ${asset}`, {
				age: Date.now() - cached.timestamp,
				price: cached.data.usdPrice
			});
			return cached.data;
		}

		// Fetch fresh data
		try {
			const priceData = await this.fetchPriceFromAPI(asset);

			// Cache the result
			this.cache.set(cacheKey, {
				data: priceData,
				timestamp: Date.now(),
				ttl: this.defaultTTL
			});

			logger.info(`Fetched fresh price for ${asset}`, {
				usdPrice: priceData.usdPrice,
				source: priceData.source
			});

			return priceData;
		} catch (error) {
			logger.error(`Failed to fetch price for ${asset}`, error as Error);

			// Return stale cache data if available
			if (cached) {
				logger.warn(`Returning stale cache data for ${asset}`, {
					age: Date.now() - cached.timestamp
				});
				return cached.data;
			}

			throw error;
		}
	}

	/**
	 * Get prices for multiple assets
	 */
	async getPrices(assets: SupportedAsset[]): Promise<PriceData[]> {
		const promises = assets.map((asset) => this.getPrice(asset));
		return Promise.all(promises);
	}

	/**
	 * Get all supported asset prices
	 */
	async getAllPrices(): Promise<PriceData[]> {
		const supportedAssets: SupportedAsset[] = ['WBTC'];
		return this.getPrices(supportedAssets);
	}

	/**
	 * Fetch price from external API
	 */
	private async fetchPriceFromAPI(asset: SupportedAsset): Promise<PriceData> {
		const assetMap: Record<SupportedAsset, string> = {
			WBTC: 'wrapped-bitcoin'
		};

		const coinId = assetMap[asset];
		const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,btc`;

		const headers: Record<string, string> = {};
		if (env.COINGECKO_API_KEY) {
			headers['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
		}

		const response = await fetch(url, { headers });

		if (!response.ok) {
			throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
		}

		const data: CoinGeckoResponse = await response.json();
		const priceInfo = data[coinId];

		if (!priceInfo) {
			throw new Error(`No price data found for ${asset} (${coinId})`);
		}

		return {
			asset,
			usdPrice: priceInfo.usd,
			btcPrice: priceInfo.btc,
			lastUpdated: Date.now(),
			source: env.COINGECKO_API_KEY ? 'CoinGecko-Pro' : 'CoinGecko-Public'
		};
	}

	/**
	 * Get cache statistics for health monitoring
	 */
	getCacheStats(): CacheStats {
		const entries = Array.from(this.cache.entries()).map(([key, entry]) => {
			const age = Date.now() - entry.timestamp;
			return {
				key,
				asset: entry.data.asset,
				age,
				isExpired: age > entry.ttl
			};
		});

		const hitRate =
			this.stats.totalRequests > 0 ? this.stats.cacheHits / this.stats.totalRequests : 0;

		return {
			size: this.cache.size,
			entries,
			hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
			totalRequests: this.stats.totalRequests,
			cacheHits: this.stats.cacheHits
		};
	}

	/**
	 * Check if pricing service is healthy
	 */
	async healthCheck(): Promise<{
		status: 'healthy' | 'unhealthy';
		message: string;
		cacheStats?: CacheStats;
	}> {
		try {
			// Test price fetch for WBTC
			const testPrice = await this.getPrice('WBTC');

			if (!testPrice || testPrice.usdPrice <= 0) {
				return {
					status: 'unhealthy',
					message: 'Pricing service returning invalid data'
				};
			}

			// Get cache statistics
			const cacheStats = this.getCacheStats();

			return {
				status: 'healthy',
				message: 'Pricing service operational',
				cacheStats
			};
		} catch (error) {
			return {
				status: 'unhealthy',
				message: `Pricing service error: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		let cleaned = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			logger.debug(`Cleaned ${cleaned} expired cache entries`);
		}
	}

	/**
	 * Clear all cache entries
	 */
	clearCache(): void {
		this.cache.clear();
		this.stats = {
			totalRequests: 0,
			cacheHits: 0
		};
		logger.info('Pricing service cache cleared');
	}
}

// Export singleton instance
export const serverPricingService = ServerPricingService.getInstance();
