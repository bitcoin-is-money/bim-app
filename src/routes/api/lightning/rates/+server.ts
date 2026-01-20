/**
 * @fileoverview Lightning Exchange Rates API
 *
 * This endpoint provides real-time exchange rates for Lightning Bitcoin
 * to Starknet asset swaps. It serves cached rates with automatic refresh
 * and supports multiple asset queries.
 *
 * @requires $lib/services/pricing.service - Pricing service
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { getSupportedAssets } from '$lib/services/server/atomiq/atomiq-assets';
import { serverPricingService, type SupportedAsset } from '$lib/services/server/pricing.service';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Exchange rates response
 */
interface ExchangeRatesResponse {
	rates: Array<{
		asset: SupportedAsset;
		usdPrice: number;
		btcPrice: number;
		lastUpdated: string;
		source: string;
	}>;
	timestamp: string;
	cacheStats?: {
		size: number;
		entries: Array<{
			key: string;
			asset: SupportedAsset;
			age: number;
			ttl: number;
			source: string;
		}>;
	};
}

/**
 * Get Lightning exchange rates
 *
 * GET /api/lightning/rates?assets=WBTC,STRK,ETH&include_cache=true
 *
 * Returns current exchange rates for Lightning Bitcoin to Starknet assets
 * with caching for performance optimization.
 *
 * @query assets - Comma-separated list of assets (optional, defaults to all)
 * @query include_cache - Include cache statistics in response (optional)
 * @returns 200 - Exchange rates retrieved successfully
 * @returns 400 - Invalid parameters
 * @returns 500 - Internal server error
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const assetsParam = url.searchParams.get('assets');
		const includeCacheParam = url.searchParams.get('include_cache');

		// Parse requested assets
		let requestedAssets: SupportedAsset[];
		if (assetsParam) {
			const assetList = assetsParam.split(',').map((asset) => asset.trim().toUpperCase());
			const supportedAssets = await getSupportedAssets();

			// Validate assets
			const invalidAssets = assetList.filter((asset) => !supportedAssets.includes(asset));
			if (invalidAssets.length > 0) {
				return json(
					{
						error: 'Invalid assets',
						message: `Unsupported assets: ${invalidAssets.join(', ')}`,
						supportedAssets
					},
					{ status: 400 }
				);
			}

			requestedAssets = assetList as SupportedAsset[];
		} else {
			// Default to all supported assets
			const supportedAssets = await getSupportedAssets();
			requestedAssets = supportedAssets as SupportedAsset[];
		}

		logger.info('Fetching exchange rates', {
			assets: requestedAssets,
			includeCacheStats: includeCacheParam === 'true'
		});

		// Fetch prices for requested assets
		const priceData = await serverPricingService.getPrices(requestedAssets);

		// Format response
		const response: ExchangeRatesResponse = {
			rates: priceData.map((data) => ({
				asset: data.asset,
				usdPrice: data.usdPrice,
				btcPrice: data.btcPrice,
				lastUpdated: new Date(data.lastUpdated).toISOString(),
				source: data.source
			})),
			timestamp: new Date().toISOString()
		};

		// Include cache statistics if requested
		if (includeCacheParam === 'true') {
			response.cacheStats = serverPricingService.getCacheStats();
		}

		logger.info('Exchange rates retrieved successfully', {
			assetCount: priceData.length,
			sources: [...new Set(priceData.map((p) => p.source))]
		});

		return json(response);
	} catch (error) {
		logger.error('Failed to fetch exchange rates', error as Error);

		return json(
			{
				error: 'Rates fetch failed',
				message: 'Failed to retrieve exchange rates'
			},
			{ status: 500 }
		);
	}
};

/**
 * Refresh exchange rates cache
 *
 * POST /api/lightning/rates
 *
 * Forces a refresh of the exchange rates cache by clearing cached data
 * and fetching fresh rates from external sources.
 *
 * @returns 200 - Cache refreshed successfully
 * @returns 500 - Internal server error
 */
export const POST: RequestHandler = async () => {
	try {
		logger.info('Refreshing exchange rates cache');

		// Clear the cache to force fresh data
		serverPricingService.clearCache();

		// Fetch fresh rates for all supported assets
		const freshRates = await serverPricingService.getAllPrices();

		logger.info('Exchange rates cache refreshed successfully', {
			assetCount: freshRates.length,
			sources: [...new Set(freshRates.map((r) => r.source))]
		});

		return json({
			success: true,
			message: 'Exchange rates cache refreshed',
			rates: freshRates.map((data) => ({
				asset: data.asset,
				usdPrice: data.usdPrice,
				btcPrice: data.btcPrice,
				lastUpdated: new Date(data.lastUpdated).toISOString(),
				source: data.source
			})),
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		logger.error('Failed to refresh exchange rates cache', error as Error);

		return json(
			{
				error: 'Cache refresh failed',
				message: 'Failed to refresh exchange rates cache'
			},
			{ status: 500 }
		);
	}
};
