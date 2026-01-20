/**
 * @fileoverview Swap Quote Calculator
 *
 * Handles swap quote calculations including fees, price impact,
 * and exchange rate calculations for Lightning to Starknet asset swaps.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import type { PriceData, SwapQuote } from './types';

/**
 * Configuration for swap calculations
 */
export interface SwapConfig {
	networkFeeRate: number; // Network fee rate (default: 0.001 = 0.1%)
	swapFeeRate: number; // Swap fee rate (default: 0.005 = 0.5%)
	largeTradePriceImpact: number; // Price impact for large trades (default: 0.1 = 10%)
	smallTradePriceImpact: number; // Price impact for small trades (default: 0.05 = 5%)
	largeTradeThreshold: number; // Threshold for large trades in sats (default: 10M sats)
}

/**
 * Default swap configuration
 */
const DEFAULT_SWAP_CONFIG: SwapConfig = {
	networkFeeRate: 0.001, // 0.1%
	swapFeeRate: 0.005, // 0.5%
	largeTradePriceImpact: 0.1, // 10%
	smallTradePriceImpact: 0.05, // 5%
	largeTradeThreshold: 10000000 // 10M sats
};

/**
 * Swap quote calculation service
 */
export class SwapCalculator {
	private config: SwapConfig;

	constructor(config?: Partial<SwapConfig>) {
		this.config = { ...DEFAULT_SWAP_CONFIG, ...config };
	}

	/**
	 * Calculate swap quote for Lightning to Starknet asset
	 */
	calculateQuote(amountSats: number, destinationAssetPrice: PriceData): SwapQuote {
		try {
			// Calculate fees
			const networkFee = Math.floor(amountSats * this.config.networkFeeRate);
			const swapFee = Math.floor(amountSats * this.config.swapFeeRate);
			const totalFees = networkFee + swapFee;

			// Calculate output amount
			const btcAmount = (amountSats - totalFees) / 100000000; // Convert to BTC after fees
			const estimatedOutput = btcAmount / destinationAssetPrice.btcPrice;

			// Calculate price impact (higher for larger amounts)
			const priceImpact =
				amountSats > this.config.largeTradeThreshold
					? this.config.largeTradePriceImpact
					: this.config.smallTradePriceImpact;

			return {
				inputAmount: amountSats,
				estimatedOutput,
				exchangeRate: destinationAssetPrice.btcPrice,
				priceImpact,
				fees: {
					network: networkFee,
					swap: swapFee,
					total: totalFees
				}
			};
		} catch (error) {
			logger.error('Failed to calculate swap quote', error as Error);
			throw new Error('Failed to calculate swap quote');
		}
	}

	/**
	 * Calculate estimated input amount for desired output
	 */
	calculateReverseQuote(desiredOutput: number, destinationAssetPrice: PriceData): SwapQuote {
		try {
			// Calculate required BTC amount before fees
			const requiredBtcAmount = desiredOutput * destinationAssetPrice.btcPrice;

			// Calculate required sats before fees
			const requiredSatsBeforeFees = requiredBtcAmount * 100000000;

			// Calculate required input amount (accounting for fees)
			const totalFeeRate = this.config.networkFeeRate + this.config.swapFeeRate;
			const inputAmount = Math.ceil(requiredSatsBeforeFees / (1 - totalFeeRate));

			// Use forward calculation to get accurate quote
			return this.calculateQuote(inputAmount, destinationAssetPrice);
		} catch (error) {
			logger.error('Failed to calculate reverse swap quote', error as Error);
			throw new Error('Failed to calculate reverse swap quote');
		}
	}

	/**
	 * Update swap configuration
	 */
	updateConfig(newConfig: Partial<SwapConfig>): void {
		this.config = { ...this.config, ...newConfig };
		logger.info('Swap calculator configuration updated', newConfig);
	}

	/**
	 * Get current configuration
	 */
	getConfig(): SwapConfig {
		return { ...this.config };
	}

	/**
	 * Validate input amount
	 */
	validateAmount(amountSats: number): { valid: boolean; error?: string } {
		if (amountSats <= 0) {
			return { valid: false, error: 'Amount must be greater than zero' };
		}

		if (amountSats < 1000) {
			// Minimum 1000 sats
			return { valid: false, error: 'Amount too small (minimum 1000 sats)' };
		}

		if (amountSats > 100000000000) {
			// Maximum 1000 BTC
			return { valid: false, error: 'Amount too large (maximum 1000 BTC)' };
		}

		const totalFeeRate = this.config.networkFeeRate + this.config.swapFeeRate;
		const minAmountAfterFees = amountSats * (1 - totalFeeRate);

		if (minAmountAfterFees <= 0) {
			return { valid: false, error: 'Amount too small after fees' };
		}

		return { valid: true };
	}
}
