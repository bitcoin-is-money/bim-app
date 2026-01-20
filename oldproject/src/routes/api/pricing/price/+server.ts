import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { logger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';
import type { PriceData } from '$lib/services/client/pricing/types';

// Map our supported assets to CoinGecko IDs
const COINGECKO_IDS: Record<string, string> = {
	WBTC: 'wrapped-bitcoin'
};

export const GET: RequestHandler = async ({ url, fetch }) => {
	const asset = url.searchParams.get('asset') || '';
	const id = COINGECKO_IDS[asset];

	if (!id) {
		logger.warn('Pricing API: Unsupported asset requested', undefined, {
			asset
		});
		return json({ error: `Unsupported asset: ${asset}` }, { status: 400 });
	}

	const baseUrl = 'https://api.coingecko.com/api/v3/simple/price';
	const qs = `ids=${encodeURIComponent(id)}&vs_currencies=usd,btc`;

	const apiKey = privateEnv.COINGECKO_API_KEY;

	// Try with API key first (if present), then fallback to public
	const attempts: Array<{ name: string; headers?: Record<string, string> }> = [];
	if (apiKey) {
		attempts.push({ name: 'CoinGecko', headers: { 'x-cg-demo-api-key': apiKey } });
	}
	attempts.push({ name: 'CoinGecko-Public' });

	let lastError: Error | null = null;

	for (const attempt of attempts) {
		try {
			const res = await fetch(`${baseUrl}?${qs}`, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					...(attempt.headers || {})
				}
			});

			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ${res.statusText}`);
			}

			const data = (await res.json()) as Record<string, { usd: number; btc: number }>;

			const item = data[id];
			if (!item) {
				throw new Error('Unexpected response format');
			}

			const price: PriceData = {
				asset: asset as PriceData['asset'],
				usdPrice: item.usd,
				btcPrice: item.btc,
				lastUpdated: Date.now(),
				source: attempt.name
			};

			logger.info('Pricing API: Fetched price', undefined, {
				asset,
				source: attempt.name,
				usdPrice: price.usdPrice,
				btcPrice: price.btcPrice
			});

			return json(price);
		} catch (err) {
			lastError = err as Error;
			logger.warn('Pricing API: Attempt failed', undefined, {
				asset,
				attempt: attempt.name,
				error: lastError.message
			});
			continue;
		}
	}

	logger.error('Pricing API: All attempts failed', lastError || undefined, {
		asset
	});
	return json({ error: `Failed to fetch price for ${asset}` }, { status: 502 });
};
