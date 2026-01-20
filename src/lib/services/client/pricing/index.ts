/**
 * @fileoverview Pricing Module Index
 *
 * Main entry point for the pricing system. Exports all pricing
 * services, types, and functionality organized by domain.
 *
 * @author bim
 * @version 2.0.0
 */

// Core types and interfaces
export type {
	CacheEntry,
	CacheStats,
	CoinGeckoResponse,
	PriceData,
	PriceSource,
	SupportedAsset,
	SwapQuote
} from './types';

// Specialized service classes
export { CacheManager } from './cache-manager';
export { FallbackProvider, type FallbackPriceConfig } from './fallback-provider';
export { PriceFetcher } from './price-fetcher';
export { SwapCalculator, type SwapConfig } from './swap-calculator';

// Main orchestrator service
export { PricingOrchestrator } from './pricing-orchestrator';

// Factory function for singleton instance
import { PricingOrchestrator } from './pricing-orchestrator';
export const getPricingOrchestrator = (): PricingOrchestrator => {
	return PricingOrchestrator.getInstance();
};
