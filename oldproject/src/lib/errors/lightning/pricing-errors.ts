/**
 * @fileoverview Lightning Pricing and Quote Errors
 *
 * Error classes and factory functions for pricing-related failures.
 */

import { LightningError } from './base';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Pricing and quote errors
 */
export class LightningPricingError extends LightningError {
	constructor(
		code: LightningErrorCode,
		message: string,
		userMessage: string,
		severity: ErrorSeverity = ErrorSeverity.MEDIUM,
		recoveryActions: RecoveryAction[] = [RecoveryAction.RETRY],
		context: Record<string, any> = {}
	) {
		super(code, message, userMessage, severity, recoveryActions, context);
	}
}

/**
 * Factory functions for pricing errors
 */
export const PricingErrors = {
	pricingFailed: (asset: string) =>
		new LightningPricingError(
			LightningErrorCode.PRICING_ERROR,
			`Failed to get pricing for asset: ${asset}`,
			'Unable to get current exchange rates. Please try again.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.RETRY],
			{ asset }
		),

	quoteFailed: (reason?: string) =>
		new LightningPricingError(
			LightningErrorCode.QUOTE_FAILED,
			`Quote generation failed: ${reason || 'Unknown error'}`,
			'Unable to generate price quote. Please try again.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.RETRY],
			{ reason }
		),

	quoteExpired: (quoteId: string) =>
		new LightningPricingError(
			LightningErrorCode.QUOTE_EXPIRED,
			`Quote expired: ${quoteId}`,
			'The price quote has expired. Please request a new quote.',
			ErrorSeverity.LOW,
			[RecoveryAction.RETRY],
			{ quoteId }
		)
};
