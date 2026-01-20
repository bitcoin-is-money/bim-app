/**
 * @fileoverview Lightning Service Initialization Errors
 *
 * Error classes and factory functions for service-related failures.
 */

import { LightningError } from './base';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Service initialization errors
 */
export class LightningServiceError extends LightningError {
	constructor(
		code: LightningErrorCode,
		message: string,
		userMessage: string,
		context: Record<string, any> = {}
	) {
		super(
			code,
			message,
			userMessage,
			ErrorSeverity.CRITICAL,
			[RecoveryAction.CONTACT_SUPPORT, RecoveryAction.REFRESH_PAGE],
			context
		);
	}
}

/**
 * Factory functions for service errors
 */
export const ServiceErrors = {
	serviceUnavailable: () =>
		new LightningServiceError(
			LightningErrorCode.SERVICE_UNAVAILABLE,
			'Lightning service is currently unavailable',
			'Lightning payments are temporarily unavailable. Please try again later or contact support.',
			{}
		),

	sdkNotAvailable: () =>
		new LightningServiceError(
			LightningErrorCode.SDK_NOT_AVAILABLE,
			'Atomiq SDK is not available',
			'Lightning payment system is not properly configured. Please contact support.',
			{}
		),

	initializationFailed: (reason?: string) =>
		new LightningServiceError(
			LightningErrorCode.INITIALIZATION_FAILED,
			`Service initialization failed: ${reason || 'Unknown error'}`,
			'Lightning payment system failed to initialize. Please contact support.',
			{ reason }
		),

	rateLimitExceeded: (retryAfter: number) =>
		new LightningServiceError(
			LightningErrorCode.RATE_LIMIT_EXCEEDED,
			'Rate limit exceeded',
			'Too many requests. Please wait before trying again.',
			{ retryAfter }
		),

	internalError: (message: string, userMessage: string, context: Record<string, any> = {}) =>
		new LightningServiceError(LightningErrorCode.INTERNAL_ERROR, message, userMessage, context)
};
