/**
 * @fileoverview Lightning Error Factory Functions
 *
 * Convenient factory functions for creating common Lightning errors.
 * Provides a clean API for error creation without needing to know error codes.
 */

import { UnifiedLightningError } from './unified-error';
import { LightningErrorCode } from './constants';

/**
 * Factory class for creating Lightning errors
 */
export class LightningErrors {
	// ===== NETWORK ERRORS =====

	static networkError(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.NETWORK_ERROR,
			message || 'Network connection failed',
			context ? { context } : {}
		);
	}

	static timeoutError(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.TIMEOUT_ERROR,
			message || 'Operation timed out',
			context ? { context } : {}
		);
	}

	static connectionFailed(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.CONNECTION_FAILED,
			message || 'Connection to service failed',
			context ? { context } : {}
		);
	}

	// ===== PAYMENT ERRORS =====

	static paymentFailed(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.PAYMENT_FAILED,
			message || 'Payment processing failed',
			context ? { context } : {}
		);
	}

	static paymentTimeout(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.PAYMENT_TIMEOUT,
			message || 'Payment timed out',
			context ? { context } : {}
		);
	}

	static paymentExpired(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.PAYMENT_EXPIRED,
			message || 'Payment expired',
			context ? { context } : {}
		);
	}

	static insufficientFunds(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.INSUFFICIENT_FUNDS,
			message || 'Insufficient funds for payment',
			context ? { context } : {}
		);
	}

	// ===== SWAP ERRORS =====

	static swapFailed(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.SWAP_FAILED,
			message || 'Swap operation failed',
			context ? { context } : {}
		);
	}

	static swapTimeout(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.SWAP_TIMEOUT,
			message || 'Swap operation timed out',
			context ? { context } : {}
		);
	}

	static swapSlippageExceeded(
		message?: string,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.SWAP_SLIPPAGE_EXCEEDED,
			message || 'Swap slippage exceeded maximum tolerance',
			context ? { context } : {}
		);
	}

	// ===== VALIDATION ERRORS =====

	static validationError(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.VALIDATION_ERROR,
			message || 'Validation failed',
			context ? { context } : {}
		);
	}

	static invalidAmount(amount?: any, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.INVALID_AMOUNT,
			`Invalid amount: ${amount}`,
			{ context: { amount, ...context } }
		);
	}

	static invalidAddress(address?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.INVALID_ADDRESS,
			`Invalid address: ${address}`,
			{ context: { address, ...context } }
		);
	}

	static unsupportedAsset(asset?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.UNSUPPORTED_ASSET,
			`Unsupported asset: ${asset}`,
			{ context: { asset, ...context } }
		);
	}

	static amountTooSmall(
		amount?: any,
		minimum?: any,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.AMOUNT_TOO_SMALL,
			`Amount ${amount} is below minimum ${minimum}`,
			{ context: { amount, minimum, ...context } }
		);
	}

	static amountTooLarge(
		amount?: any,
		maximum?: any,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.AMOUNT_TOO_LARGE,
			`Amount ${amount} exceeds maximum ${maximum}`,
			{ context: { amount, maximum, ...context } }
		);
	}

	// ===== SERVICE ERRORS =====

	static serviceUnavailable(
		message?: string,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.SERVICE_UNAVAILABLE,
			message || 'Lightning service is unavailable',
			context ? { context } : {}
		);
	}

	static initializationFailed(
		message?: string,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.INITIALIZATION_FAILED,
			message || 'Service initialization failed',
			context ? { context } : {}
		);
	}

	static invoiceCreationFailed(
		message?: string,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.INVOICE_CREATION_FAILED,
			message || 'Failed to create Lightning invoice',
			context ? { context } : {}
		);
	}

	// ===== PRICING ERRORS =====

	static pricingError(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.PRICING_ERROR,
			message || 'Pricing service error',
			context ? { context } : {}
		);
	}

	static quoteFailed(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.QUOTE_FAILED,
			message || 'Failed to get price quote',
			context ? { context } : {}
		);
	}

	static quoteExpired(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.QUOTE_EXPIRED,
			message || 'Price quote has expired',
			context ? { context } : {}
		);
	}

	static rateLimitExceeded(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.RATE_LIMIT_EXCEEDED,
			message || 'Rate limit exceeded',
			context ? { context } : {}
		);
	}

	// ===== WEBHOOK ERRORS =====

	static webhookFailed(message?: string, context?: Record<string, any>): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.WEBHOOK_FAILED,
			message || 'Webhook processing failed',
			context ? { context } : {}
		);
	}

	static webhookInvalidSignature(
		message?: string,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.WEBHOOK_INVALID_SIGNATURE,
			message || 'Invalid webhook signature',
			context ? { context } : {}
		);
	}

	static sseConnectionFailed(
		message?: string,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.SSE_CONNECTION_FAILED,
			message || 'Server-sent events connection failed',
			context ? { context } : {}
		);
	}

	// ===== INTERNAL ERRORS =====

	static internalError(
		message?: string,
		cause?: Error,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.INTERNAL_ERROR,
			message || 'Internal server error',
			{
				...(cause && { cause }),
				...(context && { context })
			}
		);
	}

	static databaseError(
		message?: string,
		cause?: Error,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.DATABASE_ERROR,
			message || 'Database operation failed',
			{
				...(cause && { cause }),
				...(context && { context })
			}
		);
	}

	static cacheError(
		message?: string,
		cause?: Error,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(
			LightningErrorCode.CACHE_ERROR,
			message || 'Cache operation failed',
			{
				...(cause && { cause }),
				...(context && { context })
			}
		);
	}

	// ===== UTILITY METHODS =====

	/**
	 * Create error from existing error with additional context
	 */
	static fromError(
		code: LightningErrorCode,
		error: Error,
		context?: Record<string, any>
	): UnifiedLightningError {
		return new UnifiedLightningError(code, error.message, {
			cause: error,
			...(context && { context })
		});
	}

	/**
	 * Check if an error is a Lightning error
	 */
	static isLightningError(error: any): error is UnifiedLightningError {
		return error instanceof UnifiedLightningError;
	}

	/**
	 * Get error code from any error
	 */
	static getErrorCode(error: any): LightningErrorCode | null {
		if (this.isLightningError(error)) {
			return error.code;
		}
		return null;
	}
}
