/**
 * @fileoverview Lightning Payment and Invoice Errors
 *
 * Error classes and factory functions for payment-related failures.
 */

import { LightningError } from './base';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Invoice creation errors
 */
export class LightningInvoiceError extends LightningError {
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
 * Payment processing errors
 */
export class LightningPaymentError extends LightningError {
	constructor(
		code: LightningErrorCode,
		message: string,
		userMessage: string,
		severity: ErrorSeverity = ErrorSeverity.HIGH,
		recoveryActions: RecoveryAction[] = [RecoveryAction.RETRY],
		context: Record<string, any> = {}
	) {
		super(code, message, userMessage, severity, recoveryActions, context);
	}
}

/**
 * Factory functions for payment errors
 */
export const PaymentErrors = {
	// Invoice errors
	invalidAmount: (amount: number, min: number, max: number) =>
		new LightningInvoiceError(
			LightningErrorCode.INVALID_AMOUNT,
			`Invalid amount: ${amount} (min: ${min}, max: ${max})`,
			`Please enter an amount between ${min} and ${max} satoshis.`,
			ErrorSeverity.LOW,
			amount < min ? [RecoveryAction.INCREASE_AMOUNT] : [RecoveryAction.REDUCE_AMOUNT],
			{ amount, min, max }
		),

	invalidAddress: (address: string) =>
		new LightningInvoiceError(
			LightningErrorCode.INVALID_ADDRESS,
			`Invalid Starknet address: ${address}`,
			'Please provide a valid Starknet wallet address.',
			ErrorSeverity.LOW,
			[],
			{ address }
		),

	amountTooSmall: (amount: number, minimum: number) =>
		new LightningInvoiceError(
			LightningErrorCode.AMOUNT_TOO_SMALL,
			`Amount too small: ${amount} (minimum: ${minimum})`,
			`Amount is too small. Minimum amount is ${minimum} satoshis.`,
			ErrorSeverity.LOW,
			[RecoveryAction.INCREASE_AMOUNT],
			{ amount, minimum }
		),

	amountTooLarge: (amount: number, maximum: number) =>
		new LightningInvoiceError(
			LightningErrorCode.AMOUNT_TOO_LARGE,
			`Amount too large: ${amount} (maximum: ${maximum})`,
			`Amount is too large. Maximum amount is ${maximum} satoshis.`,
			ErrorSeverity.LOW,
			[RecoveryAction.REDUCE_AMOUNT],
			{ amount, maximum }
		),

	invoiceCreationFailed: (reason?: string) =>
		new LightningInvoiceError(
			LightningErrorCode.INVOICE_CREATION_FAILED,
			`Invoice creation failed: ${reason || 'Unknown error'}`,
			'Unable to create Lightning invoice. Please try again.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.RETRY],
			{ reason }
		),

	// Payment errors
	paymentFailed: (reason?: string) =>
		new LightningPaymentError(
			LightningErrorCode.PAYMENT_FAILED,
			`Lightning payment failed: ${reason || 'Unknown error'}`,
			'Your Lightning payment could not be processed. Please check your wallet and try again.',
			ErrorSeverity.HIGH,
			[RecoveryAction.CHECK_BALANCE, RecoveryAction.RETRY],
			{ reason }
		),

	paymentTimeout: (invoiceId: string) =>
		new LightningPaymentError(
			LightningErrorCode.PAYMENT_TIMEOUT,
			`Lightning payment timeout for invoice: ${invoiceId}`,
			'Payment is taking longer than expected. Please check your Lightning wallet.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.WAIT_AND_RETRY],
			{ invoiceId }
		),

	paymentExpired: (invoiceId: string) =>
		new LightningPaymentError(
			LightningErrorCode.PAYMENT_EXPIRED,
			`Lightning payment expired for invoice: ${invoiceId}`,
			'The payment window has expired. Please create a new payment.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.RETRY],
			{ invoiceId }
		),

	paymentCancelled: (invoiceId: string) =>
		new LightningPaymentError(
			LightningErrorCode.PAYMENT_CANCELLED,
			`Lightning payment cancelled for invoice: ${invoiceId}`,
			'Payment was cancelled. You can try again if needed.',
			ErrorSeverity.LOW,
			[RecoveryAction.RETRY],
			{ invoiceId }
		),

	insufficientFunds: (required: number, available: number) =>
		new LightningPaymentError(
			LightningErrorCode.INSUFFICIENT_FUNDS,
			`Insufficient funds: required ${required}, available ${available}`,
			'Insufficient funds in your Lightning wallet. Please add funds and try again.',
			ErrorSeverity.HIGH,
			[RecoveryAction.CHECK_BALANCE],
			{ required, available }
		)
};
