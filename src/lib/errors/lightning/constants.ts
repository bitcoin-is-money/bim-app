/**
 * @fileoverview Lightning Error Constants
 *
 * Central definition of error codes, severity levels, and recovery actions
 * for Lightning Network operations.
 */

/**
 * Error severity levels for monitoring and alerting
 */
export enum ErrorSeverity {
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
	CRITICAL = 'critical'
}

/**
 * Lightning Network error codes for programmatic handling
 */
export enum LightningErrorCode {
	// Network and connectivity errors
	NETWORK_ERROR = 'NETWORK_ERROR',
	TIMEOUT_ERROR = 'TIMEOUT_ERROR',
	CONNECTION_FAILED = 'CONNECTION_FAILED',

	// Service initialization errors
	SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
	INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
	SDK_NOT_AVAILABLE = 'SDK_NOT_AVAILABLE',

	// Invoice creation errors
	INVOICE_CREATION_FAILED = 'INVOICE_CREATION_FAILED',
	INVALID_AMOUNT = 'INVALID_AMOUNT',
	INVALID_ADDRESS = 'INVALID_ADDRESS',
	AMOUNT_TOO_SMALL = 'AMOUNT_TOO_SMALL',
	AMOUNT_TOO_LARGE = 'AMOUNT_TOO_LARGE',

	// Payment processing errors
	PAYMENT_FAILED = 'PAYMENT_FAILED',
	PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
	PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',
	PAYMENT_CANCELLED = 'PAYMENT_CANCELLED',
	INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',

	// Swap operation errors
	SWAP_FAILED = 'SWAP_FAILED',
	SWAP_TIMEOUT = 'SWAP_TIMEOUT',
	SWAP_CANCELLED = 'SWAP_CANCELLED',
	SWAP_EXPIRED = 'SWAP_EXPIRED',
	SWAP_SLIPPAGE_EXCEEDED = 'SWAP_SLIPPAGE_EXCEEDED',

	// Pricing and quote errors
	PRICING_ERROR = 'PRICING_ERROR',
	QUOTE_FAILED = 'QUOTE_FAILED',
	QUOTE_EXPIRED = 'QUOTE_EXPIRED',
	RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

	// Webhook and notification errors
	WEBHOOK_FAILED = 'WEBHOOK_FAILED',
	WEBHOOK_INVALID_SIGNATURE = 'WEBHOOK_INVALID_SIGNATURE',
	SSE_CONNECTION_FAILED = 'SSE_CONNECTION_FAILED',

	// Validation errors
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	UNSUPPORTED_ASSET = 'UNSUPPORTED_ASSET',
	INVALID_PARAMETERS = 'INVALID_PARAMETERS',

	// Internal system errors
	INTERNAL_ERROR = 'INTERNAL_ERROR',
	DATABASE_ERROR = 'DATABASE_ERROR',
	CACHE_ERROR = 'CACHE_ERROR'
}

/**
 * Recovery action types for error handling
 */
export enum RecoveryAction {
	RETRY = 'retry',
	RETRY_WITH_BACKOFF = 'retry_with_backoff',
	CONTACT_SUPPORT = 'contact_support',
	CHECK_NETWORK = 'check_network',
	REFRESH_PAGE = 'refresh_page',
	WAIT_AND_RETRY = 'wait_and_retry',
	REDUCE_AMOUNT = 'reduce_amount',
	INCREASE_AMOUNT = 'increase_amount',
	TRY_DIFFERENT_ASSET = 'try_different_asset',
	CHECK_BALANCE = 'check_balance'
}

/**
 * HTTP status code mappings for Lightning errors
 */
export const ERROR_STATUS_CODES: Record<LightningErrorCode, number> = {
	[LightningErrorCode.VALIDATION_ERROR]: 400,
	[LightningErrorCode.INVALID_AMOUNT]: 400,
	[LightningErrorCode.INVALID_ADDRESS]: 400,
	[LightningErrorCode.UNSUPPORTED_ASSET]: 400,
	[LightningErrorCode.AMOUNT_TOO_SMALL]: 400,
	[LightningErrorCode.AMOUNT_TOO_LARGE]: 400,
	[LightningErrorCode.INSUFFICIENT_FUNDS]: 400,
	[LightningErrorCode.INVALID_PARAMETERS]: 400,
	[LightningErrorCode.WEBHOOK_INVALID_SIGNATURE]: 401,
	[LightningErrorCode.RATE_LIMIT_EXCEEDED]: 429,
	[LightningErrorCode.SERVICE_UNAVAILABLE]: 503,
	[LightningErrorCode.TIMEOUT_ERROR]: 504,
	[LightningErrorCode.NETWORK_ERROR]: 503,
	[LightningErrorCode.CONNECTION_FAILED]: 503,
	[LightningErrorCode.INITIALIZATION_FAILED]: 500,
	[LightningErrorCode.INVOICE_CREATION_FAILED]: 500,
	[LightningErrorCode.INTERNAL_ERROR]: 500,
	[LightningErrorCode.DATABASE_ERROR]: 500,
	[LightningErrorCode.CACHE_ERROR]: 500,
	[LightningErrorCode.PAYMENT_FAILED]: 500,
	[LightningErrorCode.PAYMENT_TIMEOUT]: 408,
	[LightningErrorCode.PAYMENT_EXPIRED]: 410,
	[LightningErrorCode.PAYMENT_CANCELLED]: 409,
	[LightningErrorCode.SWAP_FAILED]: 500,
	[LightningErrorCode.SWAP_TIMEOUT]: 408,
	[LightningErrorCode.SWAP_CANCELLED]: 409,
	[LightningErrorCode.SWAP_EXPIRED]: 410,
	[LightningErrorCode.SWAP_SLIPPAGE_EXCEEDED]: 409,
	[LightningErrorCode.PRICING_ERROR]: 503,
	[LightningErrorCode.QUOTE_FAILED]: 503,
	[LightningErrorCode.QUOTE_EXPIRED]: 410,
	[LightningErrorCode.WEBHOOK_FAILED]: 500,
	[LightningErrorCode.SSE_CONNECTION_FAILED]: 503,
	[LightningErrorCode.SDK_NOT_AVAILABLE]: 503
};
