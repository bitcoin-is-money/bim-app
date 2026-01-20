/**
 * @fileoverview Lightning Validation Errors
 *
 * Error classes and factory functions for validation-related failures.
 */

import { LightningError } from './base';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Validation errors
 */
export class LightningValidationError extends LightningError {
	constructor(
		code: LightningErrorCode,
		message: string,
		userMessage: string,
		recoveryActions: RecoveryAction[] = [],
		context: Record<string, any> = {}
	) {
		super(code, message, userMessage, ErrorSeverity.LOW, recoveryActions, context);
	}
}

/**
 * Factory functions for validation errors
 */
export const ValidationErrors = {
	unsupportedAsset: (asset: string, supported: string[]) =>
		new LightningValidationError(
			LightningErrorCode.UNSUPPORTED_ASSET,
			`Unsupported asset: ${asset}`,
			`Asset ${asset} is not supported. Please choose from: ${supported.join(', ')}`,
			[RecoveryAction.TRY_DIFFERENT_ASSET],
			{ asset, supported }
		),

	validationError: (message: string, userMessage: string, context: Record<string, any> = {}) =>
		new LightningValidationError(
			LightningErrorCode.VALIDATION_ERROR,
			message,
			userMessage,
			[],
			context
		),

	invalidParameters: (parameters: string[], reason?: string) =>
		new LightningValidationError(
			LightningErrorCode.INVALID_PARAMETERS,
			`Invalid parameters: ${parameters.join(', ')} - ${reason || 'Unknown reason'}`,
			'The provided parameters are invalid. Please check your input and try again.',
			[],
			{ parameters, reason }
		)
};
