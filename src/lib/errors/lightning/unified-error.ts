/**
 * @fileoverview Unified Lightning Error System
 *
 * Consolidates all Lightning error classes into a single unified error class
 * with error codes and metadata. Replaces 6+ error classes with one configurable class.
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Error category metadata for better organization
 */
export interface ErrorMetadata {
	category:
		| 'network'
		| 'payment'
		| 'swap'
		| 'pricing'
		| 'webhook'
		| 'validation'
		| 'service'
		| 'internal';
	httpStatus: number;
	userFriendly: boolean;
	retryable: boolean;
	defaultSeverity: ErrorSeverity;
	defaultRecoveryActions: RecoveryAction[];
}

/**
 * Error category definitions
 */
const ERROR_METADATA: Record<LightningErrorCode, ErrorMetadata> = {
	// Network errors
	[LightningErrorCode.NETWORK_ERROR]: {
		category: 'network',
		httpStatus: 503,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.HIGH,
		defaultRecoveryActions: [RecoveryAction.CHECK_NETWORK, RecoveryAction.RETRY_WITH_BACKOFF]
	},
	[LightningErrorCode.TIMEOUT_ERROR]: {
		category: 'network',
		httpStatus: 504,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.RETRY_WITH_BACKOFF]
	},
	[LightningErrorCode.CONNECTION_FAILED]: {
		category: 'network',
		httpStatus: 503,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.HIGH,
		defaultRecoveryActions: [RecoveryAction.CHECK_NETWORK, RecoveryAction.WAIT_AND_RETRY]
	},

	// Payment errors
	[LightningErrorCode.PAYMENT_FAILED]: {
		category: 'payment',
		httpStatus: 500,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.HIGH,
		defaultRecoveryActions: [RecoveryAction.RETRY, RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.PAYMENT_TIMEOUT]: {
		category: 'payment',
		httpStatus: 408,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.WAIT_AND_RETRY]
	},
	[LightningErrorCode.PAYMENT_EXPIRED]: {
		category: 'payment',
		httpStatus: 410,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: [RecoveryAction.REFRESH_PAGE]
	},
	[LightningErrorCode.PAYMENT_CANCELLED]: {
		category: 'payment',
		httpStatus: 409,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: []
	},
	[LightningErrorCode.INSUFFICIENT_FUNDS]: {
		category: 'payment',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.CHECK_BALANCE, RecoveryAction.REDUCE_AMOUNT]
	},

	// Swap errors
	[LightningErrorCode.SWAP_FAILED]: {
		category: 'swap',
		httpStatus: 500,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.HIGH,
		defaultRecoveryActions: [RecoveryAction.RETRY, RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.SWAP_TIMEOUT]: {
		category: 'swap',
		httpStatus: 408,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.WAIT_AND_RETRY]
	},
	[LightningErrorCode.SWAP_CANCELLED]: {
		category: 'swap',
		httpStatus: 409,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: []
	},
	[LightningErrorCode.SWAP_EXPIRED]: {
		category: 'swap',
		httpStatus: 410,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: [RecoveryAction.REFRESH_PAGE]
	},
	[LightningErrorCode.SWAP_SLIPPAGE_EXCEEDED]: {
		category: 'swap',
		httpStatus: 409,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.RETRY, RecoveryAction.TRY_DIFFERENT_ASSET]
	},

	// Validation errors
	[LightningErrorCode.VALIDATION_ERROR]: {
		category: 'validation',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: []
	},
	[LightningErrorCode.INVALID_AMOUNT]: {
		category: 'validation',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: []
	},
	[LightningErrorCode.INVALID_ADDRESS]: {
		category: 'validation',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: []
	},
	[LightningErrorCode.UNSUPPORTED_ASSET]: {
		category: 'validation',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: [RecoveryAction.TRY_DIFFERENT_ASSET]
	},
	[LightningErrorCode.AMOUNT_TOO_SMALL]: {
		category: 'validation',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: [RecoveryAction.INCREASE_AMOUNT]
	},
	[LightningErrorCode.AMOUNT_TOO_LARGE]: {
		category: 'validation',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: [RecoveryAction.REDUCE_AMOUNT]
	},
	[LightningErrorCode.INVALID_PARAMETERS]: {
		category: 'validation',
		httpStatus: 400,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: []
	},

	// Service errors
	[LightningErrorCode.SERVICE_UNAVAILABLE]: {
		category: 'service',
		httpStatus: 503,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.CRITICAL,
		defaultRecoveryActions: [RecoveryAction.WAIT_AND_RETRY, RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.INITIALIZATION_FAILED]: {
		category: 'service',
		httpStatus: 500,
		userFriendly: false,
		retryable: true,
		defaultSeverity: ErrorSeverity.CRITICAL,
		defaultRecoveryActions: [RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.SDK_NOT_AVAILABLE]: {
		category: 'service',
		httpStatus: 503,
		userFriendly: false,
		retryable: true,
		defaultSeverity: ErrorSeverity.CRITICAL,
		defaultRecoveryActions: [RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.INVOICE_CREATION_FAILED]: {
		category: 'service',
		httpStatus: 500,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.HIGH,
		defaultRecoveryActions: [RecoveryAction.RETRY, RecoveryAction.CONTACT_SUPPORT]
	},

	// Pricing errors
	[LightningErrorCode.PRICING_ERROR]: {
		category: 'pricing',
		httpStatus: 503,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.RETRY_WITH_BACKOFF]
	},
	[LightningErrorCode.QUOTE_FAILED]: {
		category: 'pricing',
		httpStatus: 503,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.RETRY]
	},
	[LightningErrorCode.QUOTE_EXPIRED]: {
		category: 'pricing',
		httpStatus: 410,
		userFriendly: true,
		retryable: false,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: [RecoveryAction.REFRESH_PAGE]
	},
	[LightningErrorCode.RATE_LIMIT_EXCEEDED]: {
		category: 'pricing',
		httpStatus: 429,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.WAIT_AND_RETRY]
	},

	// Webhook errors
	[LightningErrorCode.WEBHOOK_FAILED]: {
		category: 'webhook',
		httpStatus: 500,
		userFriendly: false,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.RETRY_WITH_BACKOFF]
	},
	[LightningErrorCode.WEBHOOK_INVALID_SIGNATURE]: {
		category: 'webhook',
		httpStatus: 401,
		userFriendly: false,
		retryable: false,
		defaultSeverity: ErrorSeverity.HIGH,
		defaultRecoveryActions: [RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.SSE_CONNECTION_FAILED]: {
		category: 'webhook',
		httpStatus: 503,
		userFriendly: true,
		retryable: true,
		defaultSeverity: ErrorSeverity.MEDIUM,
		defaultRecoveryActions: [RecoveryAction.REFRESH_PAGE, RecoveryAction.CHECK_NETWORK]
	},

	// Internal errors
	[LightningErrorCode.INTERNAL_ERROR]: {
		category: 'internal',
		httpStatus: 500,
		userFriendly: false,
		retryable: true,
		defaultSeverity: ErrorSeverity.CRITICAL,
		defaultRecoveryActions: [RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.DATABASE_ERROR]: {
		category: 'internal',
		httpStatus: 500,
		userFriendly: false,
		retryable: true,
		defaultSeverity: ErrorSeverity.HIGH,
		defaultRecoveryActions: [RecoveryAction.RETRY_WITH_BACKOFF, RecoveryAction.CONTACT_SUPPORT]
	},
	[LightningErrorCode.CACHE_ERROR]: {
		category: 'internal',
		httpStatus: 500,
		userFriendly: false,
		retryable: true,
		defaultSeverity: ErrorSeverity.LOW,
		defaultRecoveryActions: [RecoveryAction.RETRY]
	}
};

/**
 * Unified Lightning Error class with error codes and metadata
 */
export class UnifiedLightningError extends Error {
	public readonly code: LightningErrorCode;
	public readonly severity: ErrorSeverity;
	public readonly userMessage: string;
	public readonly recoveryActions: RecoveryAction[];
	public readonly timestamp: Date;
	public readonly context: Record<string, any>;
	public readonly metadata: ErrorMetadata;
	public readonly httpStatus: number;

	constructor(
		code: LightningErrorCode,
		message: string,
		options: {
			userMessage?: string;
			severity?: ErrorSeverity;
			recoveryActions?: RecoveryAction[];
			context?: Record<string, any>;
			cause?: Error;
		} = {}
	) {
		super(message, { cause: options.cause });

		this.name = 'UnifiedLightningError';
		this.code = code;
		this.metadata = ERROR_METADATA[code];
		this.timestamp = new Date();
		this.context = options.context || {};

		// Use provided values or fall back to metadata defaults
		this.severity = options.severity || this.metadata.defaultSeverity;
		this.recoveryActions = options.recoveryActions || this.metadata.defaultRecoveryActions;
		this.httpStatus = this.metadata.httpStatus;

		// Generate user message
		this.userMessage = options.userMessage || this.generateUserMessage();

		// Capture stack trace
		Error.captureStackTrace?.(this, this.constructor);

		// Log and report error
		this.logError();
		this.reportToMonitoring();
	}

	private generateUserMessage(): string {
		if (!this.metadata.userFriendly) {
			return 'An internal error occurred. Please try again or contact support.';
		}

		// Generate user-friendly messages based on error code
		switch (this.code) {
			case LightningErrorCode.NETWORK_ERROR:
				return 'Network connection issue. Please check your internet connection and try again.';
			case LightningErrorCode.TIMEOUT_ERROR:
				return 'The request timed out. Please try again.';
			case LightningErrorCode.PAYMENT_FAILED:
				return 'Payment failed. Please try again or contact support if the issue persists.';
			case LightningErrorCode.INSUFFICIENT_FUNDS:
				return 'Insufficient funds. Please check your balance and try a smaller amount.';
			case LightningErrorCode.INVALID_AMOUNT:
				return 'Invalid amount. Please enter a valid amount.';
			case LightningErrorCode.SWAP_SLIPPAGE_EXCEEDED:
				return 'Price changed too much during the swap. Please try again.';
			case LightningErrorCode.SERVICE_UNAVAILABLE:
				return 'Service is temporarily unavailable. Please try again later.';
			default:
				return `Operation failed: ${this.code.replace(/_/g, ' ').toLowerCase()}`;
		}
	}

	private logError(): void {
		const logContext = {
			errorCode: this.code,
			severity: this.severity,
			category: this.metadata.category,
			retryable: this.metadata.retryable,
			httpStatus: this.httpStatus,
			userMessage: this.userMessage,
			recoveryActions: this.recoveryActions,
			...this.context
		};

		switch (this.severity) {
			case ErrorSeverity.CRITICAL:
			case ErrorSeverity.HIGH:
				logger.error(`Lightning Error: ${this.message}`, this, logContext);
				break;
			case ErrorSeverity.MEDIUM:
				logger.warn(`Lightning Warning: ${this.message}`, logContext);
				break;
			case ErrorSeverity.LOW:
				logger.info(`Lightning Info: ${this.message}`, logContext);
				break;
		}
	}

	private reportToMonitoring(): void {
		if (this.severity === ErrorSeverity.CRITICAL || this.severity === ErrorSeverity.HIGH) {
			monitoring.recordErrorEvent('lightning_error', {
				errorCode: this.code,
				severity: this.severity,
				category: this.metadata.category,
				retryable: this.metadata.retryable,
				...this.context
			});
		}
	}

	/**
	 * Check if this error is retryable
	 */
	isRetryable(): boolean {
		return this.metadata.retryable;
	}

	/**
	 * Get error category
	 */
	getCategory(): string {
		return this.metadata.category;
	}

	/**
	 * Convert error to JSON for API responses
	 */
	toJSON(): object {
		return {
			error: true,
			code: this.code,
			message: this.userMessage,
			severity: this.severity,
			category: this.metadata.category,
			retryable: this.metadata.retryable,
			recoveryActions: this.recoveryActions,
			timestamp: this.timestamp.toISOString(),
			context: this.context
		};
	}

	/**
	 * Convert to HTTP response format
	 */
	toHttpResponse(): { status: number; body: object } {
		return {
			status: this.httpStatus,
			body: this.toJSON()
		};
	}
}

// Export the unified error as the main Lightning error class
export { UnifiedLightningError as LightningError };

// Re-export constants for convenience
export { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';
