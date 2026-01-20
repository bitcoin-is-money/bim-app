/**
 * @fileoverview Atomiq Limits Service (pair-aware)
 *
 * Provides min/max/fee limits for swaps based on source and destination tokens.
 * Supports both Lightning (BITCOIN.BTCLN) and Bitcoin on-chain (BITCOIN.BTC) destinations.
 * Falls back to per-asset limits from AtomiqService.getSupportedAssets() when pair-specific
 * values are not available.
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { getAtomiqService } from './atomiq';

export interface AtomiqPairLimits {
	minAmount: number;
	maxAmount: number;
	fees: {
		fixed: number;
		percentage: number;
	};
}

export class AtomiqLimitsService {
	private static instance: AtomiqLimitsService;

	static getInstance(): AtomiqLimitsService {
		if (!AtomiqLimitsService.instance) {
			AtomiqLimitsService.instance = new AtomiqLimitsService();
		}
		return AtomiqLimitsService.instance;
	}

	/**
	 * Get pair-specific limits. `source` and `destination` are strings like
	 * 'STARKNET.WBTC' or 'BITCOIN.BTC' / 'BITCOIN.BTCLN'.
	 */
	async getPairLimits(source: string, destination: string): Promise<AtomiqPairLimits> {
		try {
			const key = `${source}->${destination}`.toUpperCase();

			// Pair-specific overrides (align with Atomiq SDK practical behavior)
			// Note: These are heuristic defaults until SDK exposes pair-aware limits.
			const PAIR_DEFAULTS: Record<string, Partial<AtomiqPairLimits>> = {
				// Starknet → Bitcoin on-chain tends to require higher min
				'STARKNET.WBTC->BITCOIN.BTC': { minAmount: 10000 },
				// Lightning → Starknet can be lower (example)
				'BITCOIN.BTCLN->STARKNET.WBTC': { minAmount: 1000 }
			};

			const overrides = PAIR_DEFAULTS[key] || {};

			// Fallback to per-asset limits for destination asset
			const destAsset = this.normalizeDestinationAsset(destination);
			const supported = await getAtomiqService().getSupportedAssets();
			const base = supported[destAsset as keyof typeof supported];
			if (!base) {
				throw new Error(`Unsupported destination asset for limits: ${destAsset}`);
			}

			const minAmount = overrides.minAmount ?? base.minAmount;
			const maxAmount = overrides.maxAmount ?? base.maxAmount;
			const fees = base.fees;

			return { minAmount, maxAmount, fees };
		} catch (error) {
			logger.error('Failed to get pair limits', error as Error, {
				source,
				destination
			});
			monitoring.captureException(error as Error, {
				context: 'atomiq_limits',
				source,
				destination
			});
			// Sensible fallback
			return {
				minAmount: 10000,
				maxAmount: 100_000_000,
				fees: { fixed: 1000, percentage: 0.005 }
			};
		}
	}

	/** Map destination token to our asset key for base limits */
	private normalizeDestinationAsset(destination: string): string {
		// destination like 'BITCOIN.BTC' or 'BITCOIN.BTCLN' or 'STARKNET.WBTC'
		const parts = destination.toUpperCase().split('.');
		if (parts.length !== 2) return destination.toUpperCase();
		const [chain, token] = parts;
		if (chain === 'STARKNET') return token; // WBTC/STRK/ETH
		// For Bitcoin destinations, map BTC/BTCLN to WBTC rates for fee baseline
		if (chain === 'BITCOIN') return 'WBTC';
		return token;
	}
}

export const atomiqLimits = AtomiqLimitsService.getInstance();
