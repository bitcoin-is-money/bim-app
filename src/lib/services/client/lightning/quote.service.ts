/**
 * @fileoverview Quote Service
 *
 * Handles Lightning quote retrieval and pricing operations.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import {
	ErrorSeverity,
	LightningErrorCode,
	LightningPricingError,
	RecoveryAction
} from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';

import type { LightningQuote, QuoteParams } from './types';

export class QuoteService {
	private baseUrl: string;

	constructor(baseUrl: string = '/api/lightning') {
		this.baseUrl = baseUrl;
	}

	/**
	 * Get Lightning quote
	 */
	async getQuote(params: QuoteParams): Promise<LightningQuote> {
		try {
			logger.info('Getting Lightning quote', params);

			const searchParams = new URLSearchParams({
				amount: params.amount.toString(),
				asset: params.destinationAsset
			});
			const response = await fetch(`${this.baseUrl}/quote?${searchParams}`);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new LightningPricingError(
					LightningErrorCode.QUOTE_FAILED,
					`Failed to get quote: ${response.statusText}`,
					'Failed to get quote. Please try again.',
					ErrorSeverity.MEDIUM,
					[RecoveryAction.RETRY],
					errorData
				);
			}

			const data = await response.json();
			return data.data;
		} catch (error) {
			logger.error('Failed to get Lightning quote', error as Error, params);
			monitoring.captureException(error as Error, {
				context: 'lightning_quote',
				params
			});

			if (error instanceof LightningPricingError) {
				throw error;
			}

			throw new LightningPricingError(
				'Failed to get Lightning quote',
				LightningErrorCode.QUOTE_RETRIEVAL_FAILED,
				ErrorSeverity.MEDIUM,
				error as Error
			);
		}
	}

	/**
	 * Get swap quote (alias for getQuote for compatibility)
	 */
	async getSwapQuote(amount: number, destinationAsset: string): Promise<LightningQuote> {
		return this.getQuote({ amount, destinationAsset });
	}
}
