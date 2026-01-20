/**
 * @fileoverview Core Pricing Types and Interfaces
 *
 * Defines the core types and interfaces used across all pricing modules.
 *
 * @author bim
 * @version 1.0.0
 */

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
export interface CacheEntry {
	data: PriceData;
	timestamp: number;
	ttl: number;
}

/**
 * External price API response formats
 */
export interface CoinGeckoResponse {
	[key: string]: {
		usd: number;
		btc: number;
	};
}

/**
 * Price source configuration
 */
export interface PriceSource {
	name: string;
	url: string;
	headers?: Record<string, string>;
	transform: (response: any) => PriceData[];
}

/**
 * Swap quote calculation result
 */
export interface SwapQuote {
	inputAmount: number;
	estimatedOutput: number;
	exchangeRate: number;
	priceImpact: number;
	fees: {
		network: number;
		swap: number;
		total: number;
	};
}

/**
 * Cache statistics
 */
export interface CacheStats {
	size: number;
	entries: Array<{
		key: string;
		asset: SupportedAsset;
		age: number;
		ttl: number;
		source: string;
	}>;
}
