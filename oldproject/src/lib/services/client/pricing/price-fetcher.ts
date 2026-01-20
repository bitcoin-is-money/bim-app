/**
 * @fileoverview Price Fetching Strategy (Server-proxied)
 *
 * Client calls our server route to fetch price data, so the
 * CoinGecko API key stays private on the server.
 */

import { logger } from '$lib/utils/logger';
import type { PriceData, SupportedAsset } from './types';

export class PriceFetcher {
	/**
	 * Fetch price for an asset via server route
	 */
	async fetchPrice(asset: SupportedAsset): Promise<PriceData> {
		const res = await fetch(`/api/pricing/price?asset=${encodeURIComponent(asset)}`);
		if (!res.ok) {
			const msg = await res.text().catch(() => '');
			throw new Error(`Pricing API error: ${res.status} ${res.statusText} ${msg}`);
		}
		const price = (await res.json()) as PriceData;
		logger.info('Price fetched from server', {
			asset: price.asset,
			source: price.source,
			usdPrice: price.usdPrice,
			btcPrice: price.btcPrice
		});
		return price;
	}

	/**
	 * Report available sources (server orchestrates CoinGecko primary/public)
	 */
	getAvailableSources(): string[] {
		return ['Server'];
	}
}
