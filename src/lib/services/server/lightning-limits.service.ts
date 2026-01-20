/**
 * @fileoverview Client-side Lightning Limits Service Wrapper
 *
 * This service provides a client-side wrapper around the server-side Lightning Limits API
 * endpoints. It handles Lightning Network limits and validation by making HTTP requests to
 * the server-side API routes.
 *
 * Key Features:
 * - Lightning limits retrieval and validation
 * - Amount validation against dynamic limits
 * - Fee calculation and validation
 * - Error handling and retry logic
 *
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/utils/monitoring - Monitoring integration
 * @requires $lib/errors/lightning - Lightning error types
 *
 * @author bim
 * @version 2.0.0
 */

import { LightningErrorCode, LightningValidationError } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { getAtomiqService } from '$lib/services/server/atomiq';

/**
 * Lightning limits response from server
 */
export interface LightningLimits {
	minAmount: number;
	maxAmount: number;
	maxDailyVolume: number;
	fees: {
		fixed: number;
		percentage: number;
	};
}

/**
 * Client-side Lightning Limits Service
 */
export class LightningLimitsService {
	private static instance: LightningLimitsService;

	private constructor() {
		// No HTTP calls needed - we use atomiqService directly
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): LightningLimitsService {
		if (!LightningLimitsService.instance) {
			LightningLimitsService.instance = new LightningLimitsService();
		}
		return LightningLimitsService.instance;
	}

	/**
	 * Get Lightning limits for a specific asset
	 */
	async getLimits(destinationAsset: string): Promise<LightningLimits> {
		try {
			// Validate input parameter
			if (!destinationAsset || typeof destinationAsset !== 'string') {
				throw new LightningValidationError(
					LightningErrorCode.VALIDATION_ERROR,
					'Invalid destination asset parameter',
					'Please provide a valid destination asset.',
					[],
					{ destinationAsset }
				);
			}

			logger.info('Getting Lightning limits', { destinationAsset });

			// Use atomiqService directly instead of HTTP calls
			const supportedAssets = await getAtomiqService().getSupportedAssets();
			const assetLimits = supportedAssets[destinationAsset];

			if (!assetLimits) {
				throw new LightningValidationError(
					LightningErrorCode.LIMITS_RETRIEVAL_FAILED,
					`Asset ${destinationAsset} is not supported`,
					`Asset ${destinationAsset} is not supported for Lightning swaps.`,
					[],
					{ destinationAsset, supportedAssets: Object.keys(supportedAssets) }
				);
			}

			return {
				minAmount: assetLimits.minAmount,
				maxAmount: assetLimits.maxAmount,
				maxDailyVolume: assetLimits.maxDailyVolume,
				fees: assetLimits.fees
			};
		} catch (error) {
			logger.error('Failed to get Lightning limits', error as Error, {
				destinationAsset
			});
			monitoring.captureException(error as Error, {
				context: 'lightning_limits',
				destinationAsset
			});

			if (error instanceof LightningValidationError) {
				throw error;
			}

			throw new LightningValidationError(
				LightningErrorCode.LIMITS_RETRIEVAL_FAILED,
				'Failed to get Lightning limits',
				'Failed to retrieve Lightning limits. Please try again later.',
				[],
				{ originalError: error as Error }
			);
		}
	}

	/**
	 * Validate amount against Lightning limits
	 */
	async validateAmount(amount: number, destinationAsset: string): Promise<void> {
		try {
			logger.info('Validating amount against limits', {
				amount,
				destinationAsset
			});

			const limits = await this.getLimits(destinationAsset);

			if (amount < limits.minAmount) {
				throw new LightningValidationError(
					LightningErrorCode.AMOUNT_BELOW_MINIMUM,
					`Amount ${amount} is below minimum ${limits.minAmount}`,
					`Amount must be at least ${limits.minAmount}. Please increase your amount and try again.`,
					[],
					{ amount, minAmount: limits.minAmount }
				);
			}

			if (amount > limits.maxAmount) {
				throw new LightningValidationError(
					LightningErrorCode.AMOUNT_ABOVE_MAXIMUM,
					`Amount ${amount} is above maximum ${limits.maxAmount}`,
					`Amount must be no more than ${limits.maxAmount}. Please decrease your amount and try again.`,
					[],
					{ amount, maxAmount: limits.maxAmount }
				);
			}

			logger.info('Amount validation passed', { amount, destinationAsset });
		} catch (error) {
			logger.error('Amount validation failed', error as Error, {
				amount,
				destinationAsset
			});
			monitoring.captureException(error as Error, {
				context: 'lightning_amount_validation',
				amount,
				destinationAsset
			});

			if (error instanceof LightningValidationError) {
				throw error;
			}

			throw new LightningValidationError(
				LightningErrorCode.VALIDATION_ERROR,
				'Amount validation failed',
				'Amount validation failed. Please check your input and try again.',
				[],
				{ originalError: error as Error }
			);
		}
	}

	/**
	 * Calculate fees for a given amount and asset
	 */
	async calculateFees(
		amount: number,
		destinationAsset: string
	): Promise<{
		fixed: number;
		percentage: number;
		total: number;
	}> {
		try {
			logger.info('Calculating fees', { amount, destinationAsset });

			const limits = await this.getLimits(destinationAsset);
			const fixedFee = limits.fees.fixed;
			const percentageFee = (amount * limits.fees.percentage) / 100;
			const totalFee = fixedFee + percentageFee;

			logger.info('Fees calculated', {
				amount,
				destinationAsset,
				fixedFee,
				percentageFee,
				totalFee
			});

			return {
				fixed: fixedFee,
				percentage: percentageFee,
				total: totalFee
			};
		} catch (error) {
			logger.error('Failed to calculate fees', error as Error, {
				amount,
				destinationAsset
			});
			monitoring.captureException(error as Error, {
				context: 'lightning_fee_calculation',
				amount,
				destinationAsset
			});

			if (error instanceof LightningValidationError) {
				throw error;
			}

			throw new LightningValidationError(
				LightningErrorCode.FEE_CALCULATION_FAILED,
				'Failed to calculate fees',
				'Failed to calculate fees. Please try again later.',
				[],
				{ originalError: error as Error }
			);
		}
	}

	/**
	 * Get supported assets
	 */
	async getSupportedAssets(): Promise<string[]> {
		try {
			logger.info('Getting supported assets');

			// Use atomiqService directly instead of HTTP calls
			const supportedAssets = await getAtomiqService().getSupportedAssets();
			return Object.keys(supportedAssets);
		} catch (error) {
			logger.error('Failed to get supported assets', error as Error);
			monitoring.captureException(error as Error, {
				context: 'lightning_supported_assets'
			});

			if (error instanceof LightningValidationError) {
				throw error;
			}

			// Return empty array instead of hardcoded fallback
			return [];
		}
	}
}

/**
 * Singleton instance for client-side usage
 */
export const lightningLimits = LightningLimitsService.getInstance();
