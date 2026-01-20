/**
 * @fileoverview Lightning Error Handler Utilities
 *
 * Utility functions for handling and converting Lightning errors.
 */

import { LightningError } from './base';
import { LightningServiceError } from './service-errors';
import { ERROR_STATUS_CODES, LightningErrorCode } from './constants';

/**
 * Error handler utilities
 */
export const ErrorHandlers = {
	/**
	 * Handle API errors with proper status codes
	 */
	handleApiError: (error: LightningError) => {
		const statusCode = ERROR_STATUS_CODES[error.code] || 500;

		return {
			status: statusCode,
			body: error.toJSON()
		};
	},

	/**
	 * Convert unknown errors to Lightning errors
	 */
	fromUnknownError: (error: unknown, context: Record<string, any> = {}): LightningError => {
		if (error instanceof LightningError) {
			return error;
		}

		if (error instanceof Error) {
			return new LightningServiceError(
				LightningErrorCode.INTERNAL_ERROR,
				error.message,
				'An unexpected error occurred. Please try again.',
				{ originalError: error.message, ...context }
			);
		}

		return new LightningServiceError(
			LightningErrorCode.INTERNAL_ERROR,
			'Unknown error occurred',
			'An unexpected error occurred. Please try again.',
			{ originalError: String(error), ...context }
		);
	},

	/**
	 * Check if error is retriable
	 */
	isRetriable: (error: LightningError): boolean => {
		const retriableCodes = [
			LightningErrorCode.TIMEOUT_ERROR,
			LightningErrorCode.NETWORK_ERROR,
			LightningErrorCode.CONNECTION_FAILED,
			LightningErrorCode.SERVICE_UNAVAILABLE,
			LightningErrorCode.PRICING_ERROR,
			LightningErrorCode.QUOTE_FAILED
		];

		return retriableCodes.includes(error.code);
	},

	/**
	 * Get retry delay in milliseconds based on error type
	 */
	getRetryDelay: (_error: LightningError, attempt: number): number => {
		const baseDelay = 1000; // 1 second
		const maxDelay = 30000; // 30 seconds

		// Exponential backoff with jitter
		const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
		const jitter = Math.random() * 0.1 * delay;

		return delay + jitter;
	},

	/**
	 * Check if error requires immediate attention
	 */
	isHighPriority: (error: LightningError): boolean => {
		return error.severity === 'critical' || error.severity === 'high';
	}
};
