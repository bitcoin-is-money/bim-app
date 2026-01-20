/**
 * @fileoverview API Error Codes and Status Mappings
 *
 * Centralized definition of API error codes and their HTTP status mappings.
 */

/**
 * Standard error codes for API responses
 */
export enum ApiErrorCode {
	// Client Errors (4xx)
	INVALID_REQUEST = 'INVALID_REQUEST',
	MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
	INVALID_FORMAT = 'INVALID_FORMAT',
	UNAUTHORIZED = 'UNAUTHORIZED',
	FORBIDDEN = 'FORBIDDEN',
	NOT_FOUND = 'NOT_FOUND',
	METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
	CONFLICT = 'CONFLICT',
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
	PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
	UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',

	// Business Logic Errors (4xx)
	UNSUPPORTED_ASSET = 'UNSUPPORTED_ASSET',
	INVALID_AMOUNT = 'INVALID_AMOUNT',
	INVALID_ADDRESS = 'INVALID_ADDRESS',
	INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
	EXPIRED_QUOTE = 'EXPIRED_QUOTE',
	SWAP_NOT_FOUND = 'SWAP_NOT_FOUND',
	SWAP_FAILED = 'SWAP_FAILED',
	PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
	DUPLICATE_CREDENTIAL = 'DUPLICATE_CREDENTIAL',
	INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
	SESSION_EXPIRED = 'SESSION_EXPIRED',
	AMOUNT_TOO_SMALL = 'AMOUNT_TOO_SMALL',
	AMOUNT_TOO_LARGE = 'AMOUNT_TOO_LARGE',
	INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
	INVALID_PARAMETERS = 'INVALID_PARAMETERS',

	// Server Errors (5xx)
	INTERNAL_ERROR = 'INTERNAL_ERROR',
	SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
	DATABASE_ERROR = 'DATABASE_ERROR',
	EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
	TIMEOUT = 'TIMEOUT',
	NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
	CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
	CACHE_ERROR = 'CACHE_ERROR',
	CONNECTION_FAILED = 'CONNECTION_FAILED',
	INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
	INVOICE_CREATION_FAILED = 'INVOICE_CREATION_FAILED',
	NETWORK_ERROR = 'NETWORK_ERROR'
}

/**
 * HTTP status codes mapping for error codes
 */
export const ERROR_STATUS_MAP: Record<ApiErrorCode, number> = {
	// Client Errors (4xx)
	[ApiErrorCode.INVALID_REQUEST]: 400,
	[ApiErrorCode.MISSING_REQUIRED_FIELD]: 400,
	[ApiErrorCode.INVALID_FORMAT]: 400,
	[ApiErrorCode.UNAUTHORIZED]: 401,
	[ApiErrorCode.FORBIDDEN]: 403,
	[ApiErrorCode.NOT_FOUND]: 404,
	[ApiErrorCode.METHOD_NOT_ALLOWED]: 405,
	[ApiErrorCode.CONFLICT]: 409,
	[ApiErrorCode.VALIDATION_ERROR]: 422,
	[ApiErrorCode.RATE_LIMIT_EXCEEDED]: 429,
	[ApiErrorCode.PAYLOAD_TOO_LARGE]: 413,
	[ApiErrorCode.UNSUPPORTED_MEDIA_TYPE]: 415,

	// Business Logic Errors (4xx)
	[ApiErrorCode.UNSUPPORTED_ASSET]: 400,
	[ApiErrorCode.INVALID_AMOUNT]: 400,
	[ApiErrorCode.INVALID_ADDRESS]: 400,
	[ApiErrorCode.INSUFFICIENT_LIQUIDITY]: 400,
	[ApiErrorCode.EXPIRED_QUOTE]: 400,
	[ApiErrorCode.SWAP_NOT_FOUND]: 404,
	[ApiErrorCode.SWAP_FAILED]: 500,
	[ApiErrorCode.PAYMENT_TIMEOUT]: 408,
	[ApiErrorCode.DUPLICATE_CREDENTIAL]: 409,
	[ApiErrorCode.INVALID_CREDENTIALS]: 401,
	[ApiErrorCode.SESSION_EXPIRED]: 401,
	[ApiErrorCode.AMOUNT_TOO_SMALL]: 400,
	[ApiErrorCode.AMOUNT_TOO_LARGE]: 400,
	[ApiErrorCode.INSUFFICIENT_FUNDS]: 400,
	[ApiErrorCode.INVALID_PARAMETERS]: 400,

	// Server Errors (5xx)
	[ApiErrorCode.INTERNAL_ERROR]: 500,
	[ApiErrorCode.SERVICE_UNAVAILABLE]: 503,
	[ApiErrorCode.DATABASE_ERROR]: 500,
	[ApiErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
	[ApiErrorCode.TIMEOUT]: 504,
	[ApiErrorCode.NOT_IMPLEMENTED]: 501,
	[ApiErrorCode.CONFIGURATION_ERROR]: 500,
	[ApiErrorCode.CACHE_ERROR]: 500,
	[ApiErrorCode.CONNECTION_FAILED]: 503,
	[ApiErrorCode.INITIALIZATION_FAILED]: 500,
	[ApiErrorCode.INVOICE_CREATION_FAILED]: 500,
	[ApiErrorCode.NETWORK_ERROR]: 503
};

/**
 * Get HTTP status code for an error code
 */
export function getStatusCode(errorCode: ApiErrorCode): number {
	return ERROR_STATUS_MAP[errorCode] || 500;
}

/**
 * Check if error code is a client error (4xx)
 */
export function isClientError(errorCode: ApiErrorCode): boolean {
	const status = getStatusCode(errorCode);
	return status >= 400 && status < 500;
}

/**
 * Check if error code is a server error (5xx)
 */
export function isServerError(errorCode: ApiErrorCode): boolean {
	const status = getStatusCode(errorCode);
	return status >= 500 && status < 600;
}

/**
 * Get error category based on error code
 */
export function getErrorCategory(errorCode: ApiErrorCode): 'client' | 'server' | 'unknown' {
	if (isClientError(errorCode)) return 'client';
	if (isServerError(errorCode)) return 'server';
	return 'unknown';
}
