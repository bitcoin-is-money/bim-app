/**
 * @fileoverview Limits Service
 *
 * Handles Lightning limits retrieval and validation.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import { ErrorSeverity, LightningErrorCode, LightningValidationError } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';

import type { LightningLimits } from './types';

export class LimitsService {
	private baseUrl: string;

	constructor(baseUrl: string = '/api/lightning') {
		this.baseUrl = baseUrl;
	}

	/**
	 * Get Lightning limits
	 */
	async getLimits(destinationAsset: string): Promise<LightningLimits> {
		try {
			// Validate input parameter
			if (!destinationAsset || typeof destinationAsset !== 'string') {
				throw new LightningValidationError(
					'Invalid destination asset parameter',
					LightningErrorCode.VALIDATION_ERROR,
					ErrorSeverity.LOW,
					{ destinationAsset }
				);
			}

			logger.info('Getting Lightning limits', { destinationAsset });

			const response = await fetch(
				`${this.baseUrl}/limits?asset=${encodeURIComponent(destinationAsset)}`
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new LightningValidationError(
					`Failed to get limits: ${response.statusText}`,
					LightningErrorCode.LIMITS_RETRIEVAL_FAILED,
					ErrorSeverity.MEDIUM,
					errorData
				);
			}

			const data = await response.json();
			return data.data;
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
				'Failed to get Lightning limits',
				LightningErrorCode.LIMITS_RETRIEVAL_FAILED,
				ErrorSeverity.MEDIUM,
				error as Error
			);
		}
	}
}
