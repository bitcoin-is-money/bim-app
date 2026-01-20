/**
 * @fileoverview API Error Handling Utilities
 *
 * Utilities for processing and classifying errors consistently across APIs.
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import type { RequestEvent } from '@sveltejs/kit';
import { ApiErrorCode } from './error-codes';
import { createErrorResponse } from './response-formatter';
import type { RequestMetadata } from './types';

/**
 * Error classification patterns
 */
const ERROR_PATTERNS = {
	validation: /validation|required|invalid|missing/i,
	rateLimit: /rate limit|too many/i,
	database: /database|connection|sql|postgres|sqlite/i,
	timeout: /timeout|ETIMEDOUT/i,
	network: /network|ECONNRESET|ECONNREFUSED|ENOTFOUND/i,
	auth: /unauthorized|forbidden|authentication|permission/i,
	notFound: /not found|does not exist|404/i,
	conflict: /conflict|duplicate|already exists|409/i
};

/**
 * Extract request metadata for error handling
 */
function extractRequestMetadata(endpoint: string, requestEvent?: RequestEvent): RequestMetadata {
	return {
		endpoint,
		method: requestEvent?.request.method,
		url: requestEvent?.url.pathname,
		requestId: requestEvent?.locals?.requestId || crypto.randomUUID(),
		userAgent: requestEvent?.request.headers.get('User-Agent') || undefined,
		ip: requestEvent?.getClientAddress?.() || undefined
	};
}

/**
 * Classify error based on message content
 */
function classifyError(error: Error): ApiErrorCode {
	const message = error.message.toLowerCase();

	// Check specific error patterns
	if (ERROR_PATTERNS.validation.test(message)) {
		return ApiErrorCode.VALIDATION_ERROR;
	}

	if (ERROR_PATTERNS.rateLimit.test(message)) {
		return ApiErrorCode.RATE_LIMIT_EXCEEDED;
	}

	if (ERROR_PATTERNS.database.test(message)) {
		return ApiErrorCode.DATABASE_ERROR;
	}

	if (ERROR_PATTERNS.timeout.test(message)) {
		return ApiErrorCode.TIMEOUT;
	}

	if (ERROR_PATTERNS.network.test(message)) {
		return ApiErrorCode.NETWORK_ERROR;
	}

	if (ERROR_PATTERNS.auth.test(message)) {
		return ApiErrorCode.UNAUTHORIZED;
	}

	if (ERROR_PATTERNS.notFound.test(message)) {
		return ApiErrorCode.NOT_FOUND;
	}

	if (ERROR_PATTERNS.conflict.test(message)) {
		return ApiErrorCode.CONFLICT;
	}

	// Check error name/type
	if (error.name === 'ValidationError') {
		return ApiErrorCode.VALIDATION_ERROR;
	}

	if (error.name === 'TimeoutError') {
		return ApiErrorCode.TIMEOUT;
	}

	if (error.name === 'DatabaseError') {
		return ApiErrorCode.DATABASE_ERROR;
	}

	// Default to internal error
	return ApiErrorCode.INTERNAL_ERROR;
}

/**
 * Log error with context
 */
function logError(error: unknown, metadata: RequestMetadata): void {
	logger.error(`API Error in ${metadata.endpoint}`, error as Error, {
		...metadata,
		context: 'api_error_handler'
	});
}

/**
 * Report error to monitoring system
 */
function reportError(error: unknown, metadata: RequestMetadata): void {
	monitoring.captureException(error, {
		...metadata,
		context: 'api_error_handler'
	});
}

/**
 * Get user-friendly error message
 */
function getUserFriendlyMessage(errorCode: ApiErrorCode, originalMessage: string): string {
	const messages: Partial<Record<ApiErrorCode, string>> = {
		[ApiErrorCode.VALIDATION_ERROR]:
			'The provided data is invalid. Please check your input and try again.',
		[ApiErrorCode.RATE_LIMIT_EXCEEDED]:
			'Too many requests. Please wait a moment before trying again.',
		[ApiErrorCode.DATABASE_ERROR]: 'A database error occurred. Please try again later.',
		[ApiErrorCode.TIMEOUT]: 'The request timed out. Please try again.',
		[ApiErrorCode.NETWORK_ERROR]:
			'A network error occurred. Please check your connection and try again.',
		[ApiErrorCode.UNAUTHORIZED]: 'Authentication is required to access this resource.',
		[ApiErrorCode.NOT_FOUND]: 'The requested resource was not found.',
		[ApiErrorCode.CONFLICT]: 'A conflict occurred. The resource may already exist.',
		[ApiErrorCode.SERVICE_UNAVAILABLE]:
			'The service is temporarily unavailable. Please try again later.',
		[ApiErrorCode.INTERNAL_ERROR]: 'An unexpected error occurred. Please try again later.'
	};

	return messages[errorCode] || originalMessage;
}

/**
 * Handle and format API errors consistently
 */
export function handleApiError(
	error: unknown,
	endpoint: string,
	requestEvent?: RequestEvent,
	fallbackMessage: string = 'An unexpected error occurred'
): Response {
	const metadata = extractRequestMetadata(endpoint, requestEvent);

	// Log and report the error
	logError(error, metadata);
	reportError(error, metadata);

	// Handle specific error types
	if (error instanceof Error) {
		const errorCode = classifyError(error);
		const userMessage = getUserFriendlyMessage(errorCode, error.message);

		return createErrorResponse(
			errorCode,
			userMessage,
			{
				originalError: error.name,
				stack:
					typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'
						? error.stack
						: undefined
			},
			undefined,
			metadata.requestId
		);
	}

	// Handle unknown error types
	return createErrorResponse(
		ApiErrorCode.INTERNAL_ERROR,
		getUserFriendlyMessage(ApiErrorCode.INTERNAL_ERROR, fallbackMessage),
		{
			originalError: error instanceof Error ? error.message : 'Unknown error',
			type: typeof error
		},
		undefined,
		metadata.requestId
	);
}

/**
 * Wrap API handler with standardized error handling
 */
export function withErrorHandling(
	handler: (event: RequestEvent) => Promise<Response>,
	endpoint: string
) {
	return async (event: RequestEvent): Promise<Response> => {
		try {
			return await handler(event);
		} catch (error) {
			return handleApiError(error, endpoint, event);
		}
	};
}

/**
 * Create error from API error code
 */
export function createApiError(
	code: ApiErrorCode,
	message?: string,
	details?: Record<string, any>
): Error {
	const error = new Error(message || getUserFriendlyMessage(code, ''));
	error.name = code;

	// Attach additional details
	if (details) {
		Object.assign(error, details);
	}

	return error;
}
