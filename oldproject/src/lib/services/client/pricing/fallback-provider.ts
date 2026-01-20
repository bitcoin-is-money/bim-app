/**
 * @fileoverview Fallback Price Provider
 *
 * Provides backup price data when external APIs fail.
 * Includes configurable fallback prices and emergency price data.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import type { PriceData, SupportedAsset } from './types';

/**
 * Fallback price configuration
 */
export interface FallbackPriceConfig {
	asset: SupportedAsset;
	usdPrice: number;
	btcPrice: number;
	lastUpdated?: number;
}

/**
 * Fallback price provider service
 */
export class FallbackProvider {
	private fallbackPrices: Map<SupportedAsset, FallbackPriceConfig>;

	constructor() {
		this.fallbackPrices = new Map();
		this.initializeDefaultPrices();
	}

	/**
	 * Initialize default fallback prices
	 */
	private initializeDefaultPrices(): void {
		const defaultPrices: FallbackPriceConfig[] = [
			{
				asset: 'WBTC',
				usdPrice: 50000,
				btcPrice: 1.0
			}
		];

		defaultPrices.forEach((price) => {
			this.fallbackPrices.set(price.asset, price);
		});

		logger.info('Default fallback prices initialized', {
			assets: defaultPrices.map((p) => p.asset)
		});
	}

	/**
	 * Get fallback price for an asset
	 */
	getFallbackPrice(asset: SupportedAsset): PriceData {
		const fallback = this.fallbackPrices.get(asset);

		if (!fallback) {
			throw new Error(`No fallback price available for unsupported asset: ${asset}`);
		}

		logger.warn(`Using fallback price for ${asset}`, {
			usdPrice: fallback.usdPrice,
			btcPrice: fallback.btcPrice
		});

		return {
			asset,
			usdPrice: fallback.usdPrice,
			btcPrice: fallback.btcPrice,
			lastUpdated: Date.now(),
			source: 'Fallback'
		};
	}

	/**
	 * Update fallback price for an asset
	 */
	updateFallbackPrice(asset: SupportedAsset, config: Omit<FallbackPriceConfig, 'asset'>): void {
		const updatedConfig: FallbackPriceConfig = {
			asset,
			...config,
			lastUpdated: Date.now()
		};

		this.fallbackPrices.set(asset, updatedConfig);

		logger.info(`Fallback price updated for ${asset}`, {
			usdPrice: config.usdPrice,
			btcPrice: config.btcPrice
		});
	}

	/**
	 * Update multiple fallback prices
	 */
	updateFallbackPrices(configs: FallbackPriceConfig[]): void {
		configs.forEach((config) => {
			this.updateFallbackPrice(config.asset, config);
		});
	}

	/**
	 * Get all fallback prices
	 */
	getAllFallbackPrices(): PriceData[] {
		return Array.from(this.fallbackPrices.values()).map((config) => ({
			asset: config.asset,
			usdPrice: config.usdPrice,
			btcPrice: config.btcPrice,
			lastUpdated: config.lastUpdated || Date.now(),
			source: 'Fallback'
		}));
	}

	/**
	 * Check if fallback price exists for asset
	 */
	hasFallbackPrice(asset: SupportedAsset): boolean {
		return this.fallbackPrices.has(asset);
	}

	/**
	 * Get supported assets with fallback prices
	 */
	getSupportedAssets(): SupportedAsset[] {
		return Array.from(this.fallbackPrices.keys());
	}

	/**
	 * Reset to default fallback prices
	 */
	resetToDefaults(): void {
		this.fallbackPrices.clear();
		this.initializeDefaultPrices();
		logger.info('Fallback prices reset to defaults');
	}
}
