/**
 * @fileoverview Pricing Service Orchestrator
 *
 * Orchestrates pricing operations by coordinating specialized services.
 * Provides a unified interface while maintaining separation of concerns.
 *
 * @author bim
 * @version 2.0.0
 */

import { requireEnvironment, ServiceType } from '$lib/utils/environment';
import { logger } from '$lib/utils/logger';
import { CacheManager } from './cache-manager';
import { FallbackProvider } from './fallback-provider';
import { PriceFetcher } from './price-fetcher';
import { SwapCalculator } from './swap-calculator';
import type { CacheStats, PriceData, SupportedAsset, SwapQuote } from './types';
import { atomiqAssetsClient } from '../atomiq-assets.service';

/**
 * Pricing Service Orchestrator
 *
 * Coordinates price fetching, caching, swap calculations, and fallback mechanisms
 * to provide a unified pricing interface for Lightning Bitcoin swaps.
 */
@requireEnvironment(ServiceType.CLIENT)
export class PricingOrchestrator {
	private static instance: PricingOrchestrator;

	// Specialized service instances
	private priceFetcher: PriceFetcher;
	private cacheManager: CacheManager;
	private swapCalculator: SwapCalculator;
	private fallbackProvider: FallbackProvider;

	private constructor() {
		// Initialize specialized services
		this.priceFetcher = new PriceFetcher();
		this.cacheManager = new CacheManager();
		this.swapCalculator = new SwapCalculator();
		this.fallbackProvider = new FallbackProvider();

		logger.info('Pricing Service Orchestrator initialized with specialized services');
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): PricingOrchestrator {
		if (!PricingOrchestrator.instance) {
			PricingOrchestrator.instance = new PricingOrchestrator();
		}
		return PricingOrchestrator.instance;
	}

	/**
	 * Get price for a specific asset
	 */
	async getPrice(asset: SupportedAsset): Promise<PriceData> {
		// Check cache first
		const cached = this.cacheManager.get(asset);
		if (cached) {
			return cached;
		}

		// Fetch fresh data
		try {
			const priceData = await this.priceFetcher.fetchPrice(asset);

			// Cache the result
			this.cacheManager.set(asset, priceData);

			return priceData;
		} catch (error) {
			logger.error(`Failed to fetch price for ${asset}`, error as Error);

			// Try stale cache data
			const staleData = this.cacheManager.getStale(asset);
			if (staleData) {
				logger.warn(`Using stale price data for ${asset}`);
				return staleData;
			}

			// Return fallback prices
			return this.fallbackProvider.getFallbackPrice(asset);
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
		const supportedAssets = await atomiqAssetsClient.getSupportedAssets();
		return this.getPrices(supportedAssets as SupportedAsset[]);
	}

	/**
	 * Calculate swap quote for Lightning to Starknet asset
	 */
	async calculateSwapQuote(
		amountSats: number,
		destinationAsset: SupportedAsset
	): Promise<SwapQuote> {
		// Validate amount
		const validation = this.swapCalculator.validateAmount(amountSats);
		if (!validation.valid) {
			throw new Error(validation.error);
		}

		// Get current price for destination asset
		const assetPrice = await this.getPrice(destinationAsset);

		// Calculate quote using swap calculator
		return this.swapCalculator.calculateQuote(amountSats, assetPrice);
	}

	/**
	 * Calculate reverse quote (input amount for desired output)
	 */
	async calculateReverseQuote(
		desiredOutput: number,
		destinationAsset: SupportedAsset
	): Promise<SwapQuote> {
		// Get current price for destination asset
		const assetPrice = await this.getPrice(destinationAsset);

		// Calculate reverse quote using swap calculator
		return this.swapCalculator.calculateReverseQuote(desiredOutput, assetPrice);
	}

	/**
	 * Clear all cached prices
	 */
	clearCache(): void {
		this.cacheManager.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): CacheStats {
		return this.cacheManager.getStats();
	}

	/**
	 * Update swap calculator configuration
	 */
	updateSwapConfig(config: Parameters<SwapCalculator['updateConfig']>[0]): void {
		this.swapCalculator.updateConfig(config);
	}

	/**
	 * Update fallback prices
	 */
	updateFallbackPrices(configs: Parameters<FallbackProvider['updateFallbackPrices']>[0]): void {
		this.fallbackProvider.updateFallbackPrices(configs);
	}

	/**
	 * Get available price sources
	 */
	getAvailableSources(): string[] {
		return this.priceFetcher.getAvailableSources();
	}

	/**
	 * Get service health status
	 */
	async getHealthStatus(): Promise<{
		status: 'healthy' | 'degraded' | 'unhealthy';
		cacheSize: number;
		availableSources: string[];
		lastPriceUpdate?: number;
	}> {
		const cacheStats = this.getCacheStats();
		const sources = this.getAvailableSources();

		// Try to fetch a test price to check API health
		let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
		let lastPriceUpdate: number | undefined;

		try {
			const testPrice = await this.getPrice('WBTC');
			lastPriceUpdate = testPrice.lastUpdated;

			// Check if using fallback data
			if (testPrice.source === 'Fallback') {
				status = 'degraded';
			}
		} catch (error) {
			status = 'unhealthy';
		}

		return {
			status,
			cacheSize: cacheStats.size,
			availableSources: sources,
			lastPriceUpdate
		};
	}
}
