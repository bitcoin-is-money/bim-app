/**
 * @fileoverview API Response Formatting Utilities
 *
 * Utilities for creating standardized API responses.
 */

import { json } from '@sveltejs/kit';
import type { ApiErrorCode } from './error-codes';
import { getStatusCode } from './error-codes';
import type { ApiErrorResponse, ApiSuccessResponse, ValidationError } from './types';

/**
 * Create a standardized error response
 */
export function createErrorResponse(
	code: ApiErrorCode,
	message: string,
	details?: Record<string, any>,
	validation?: ValidationError[],
	requestId?: string
): Response {
	const status = getStatusCode(code);

	const response: ApiErrorResponse = {
		error: {
			code,
			message,
			details,
			validation,
			timestamp: new Date().toISOString(),
			requestId
		},
		success: false
	};

	return json(response, { status });
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(data: T, meta?: ApiSuccessResponse<T>['meta']): Response {
	const response: ApiSuccessResponse<T> = {
		data,
		success: true,
		meta: {
			timestamp: new Date().toISOString(),
			...meta
		}
	};

	return json(response);
}

/**
 * Create a paginated success response
 */
export function createPaginatedResponse<T>(
	data: T[],
	page: number,
	limit: number,
	total: number,
	requestId?: string
): Response {
	const totalPages = Math.ceil(total / limit);

	return createSuccessResponse(data, {
		requestId,
		pagination: {
			page,
			limit,
			total,
			totalPages
		}
	});
}

/**
 * Create a validation error response
 */
export function createValidationErrorResponse(
	errors: ValidationError[],
	requestId?: string
): Response {
	return createErrorResponse(
		'VALIDATION_ERROR' as ApiErrorCode,
		'Validation failed',
		{ validationErrors: errors.length },
		errors,
		requestId
	);
}

/**
 * Create a not found response
 */
export function createNotFoundResponse(resource: string, requestId?: string): Response {
	return createErrorResponse(
		'NOT_FOUND' as ApiErrorCode,
		`${resource} not found`,
		{ resource },
		undefined,
		requestId
	);
}

/**
 * Create an unauthorized response
 */
export function createUnauthorizedResponse(
	message: string = 'Authentication required',
	requestId?: string
): Response {
	return createErrorResponse(
		'UNAUTHORIZED' as ApiErrorCode,
		message,
		undefined,
		undefined,
		requestId
	);
}

/**
 * Create a forbidden response
 */
export function createForbiddenResponse(
	message: string = 'Access denied',
	requestId?: string
): Response {
	return createErrorResponse('FORBIDDEN' as ApiErrorCode, message, undefined, undefined, requestId);
}

/**
 * Create a rate limit exceeded response
 */
export function createRateLimitResponse(retryAfter?: number, requestId?: string): Response {
	const headers: Record<string, string> = {};
	if (retryAfter) {
		headers['Retry-After'] = retryAfter.toString();
	}

	const response = createErrorResponse(
		'RATE_LIMIT_EXCEEDED' as ApiErrorCode,
		'Rate limit exceeded. Please try again later.',
		{ retryAfter },
		undefined,
		requestId
	);

	// Add headers to the response
	Object.entries(headers).forEach(([key, value]) => {
		response.headers.set(key, value);
	});

	return response;
}

/**
 * Create a service unavailable response
 */
export function createServiceUnavailableResponse(
	message: string = 'Service temporarily unavailable',
	requestId?: string
): Response {
	return createErrorResponse(
		'SERVICE_UNAVAILABLE' as ApiErrorCode,
		message,
		undefined,
		undefined,
		requestId
	);
}
