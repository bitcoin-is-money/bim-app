/**
 * @fileoverview Atomiq Assets Client Service
 *
 * Client-side service for fetching supported assets from the Atomiq SDK
 * via the API endpoint. This provides a clean separation between client
 * and server code while maintaining a single source of truth.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import { CACHE_TTL } from '$lib/constants';

/**
 * Response type for the supported assets API
 */
interface SupportedAssetsResponse {
	success: boolean;
	data: {
		supportedAssets: string[];
		count: number;
		timestamp: string;
	};
	error?: string;
	message?: string;
}

/**
 * Client service for Atomiq assets
 */
export class AtomiqAssetsClientService {
	private static instance: AtomiqAssetsClientService;
	private cachedAssets: string[] | null = null;
	private cacheTimestamp: number = 0;
	private readonly CACHE_DURATION = CACHE_TTL.MEDIUM; // 5 minutes

	private constructor() {}

	/**
	 * Get singleton instance
	 */
	static getInstance(): AtomiqAssetsClientService {
		if (!AtomiqAssetsClientService.instance) {
			AtomiqAssetsClientService.instance = new AtomiqAssetsClientService();
		}
		return AtomiqAssetsClientService.instance;
	}

	/**
	 * Get supported assets with caching
	 * @returns Promise resolving to array of supported asset symbols
	 */
	async getSupportedAssets(): Promise<string[]> {
		// Check cache first
		if (this.cachedAssets && this.isCacheValid()) {
			return this.cachedAssets;
		}

		try {
			logger.info('Fetching supported assets from API');

			const response = await fetch('/api/lightning/supported-assets');

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data: SupportedAssetsResponse = await response.json();

			if (!data.success) {
				throw new Error(data.message || 'Failed to fetch supported assets');
			}

			// Update cache
			this.cachedAssets = data.data.supportedAssets;
			this.cacheTimestamp = Date.now();

			logger.info('Supported assets fetched successfully', {
				count: data.data.count,
				assets: data.data.supportedAssets
			});

			return this.cachedAssets;
		} catch (error) {
			logger.error('Failed to fetch supported assets from API', error as Error);

			// Return cached data if available, even if expired
			if (this.cachedAssets) {
				logger.warn('Using expired cached assets due to API failure');
				return this.cachedAssets;
			}

			// Return empty array as last resort
			return [];
		}
	}

	/**
	 * Check if an asset is supported
	 * @param asset - The asset symbol to check
	 * @returns Promise resolving to boolean indicating if asset is supported
	 */
	async isAssetSupported(asset: string): Promise<boolean> {
		const supportedAssets = await this.getSupportedAssets();
		return supportedAssets.includes(asset);
	}

	/**
	 * Clear the cache to force a fresh fetch
	 */
	clearCache(): void {
		this.cachedAssets = null;
		this.cacheTimestamp = 0;
		logger.info('Supported assets cache cleared');
	}

	/**
	 * Check if the cache is still valid
	 */
	private isCacheValid(): boolean {
		return Date.now() - this.cacheTimestamp < this.CACHE_DURATION;
	}

	/**
	 * Get cache status for debugging
	 */
	getCacheStatus(): {
		hasCache: boolean;
		isExpired: boolean;
		age: number;
	} {
		return {
			hasCache: this.cachedAssets !== null,
			isExpired: this.cachedAssets !== null && !this.isCacheValid(),
			age: this.cachedAssets ? Date.now() - this.cacheTimestamp : 0
		};
	}
}

/**
 * Singleton instance for easy access
 */
export const atomiqAssetsClient = AtomiqAssetsClientService.getInstance();
