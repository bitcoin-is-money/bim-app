/**
 * @fileoverview Lightning Network and Connectivity Errors
 *
 * Error classes and factory functions for network-related failures.
 */

import { LightningError } from './base';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Network and connectivity errors
 */
export class LightningNetworkError extends LightningError {
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
			ErrorSeverity.HIGH,
			[RecoveryAction.CHECK_NETWORK, RecoveryAction.RETRY_WITH_BACKOFF],
			context
		);
	}
}

/**
 * Factory functions for network errors
 */
export const NetworkErrors = {
	connectionFailed: (details?: string) =>
		new LightningNetworkError(
			LightningErrorCode.CONNECTION_FAILED,
			`Lightning Network connection failed: ${details || 'Unknown error'}`,
			'Unable to connect to Lightning Network. Please check your internet connection and try again.',
			{ details }
		),

	timeout: (operation: string, timeoutMs: number) =>
		new LightningNetworkError(
			LightningErrorCode.TIMEOUT_ERROR,
			`Lightning operation timed out: ${operation} after ${timeoutMs}ms`,
			'The Lightning Network operation is taking longer than expected. Please try again.',
			{ operation, timeoutMs }
		),

	networkError: (details?: string) =>
		new LightningNetworkError(
			LightningErrorCode.NETWORK_ERROR,
			`Network error occurred: ${details || 'Unknown error'}`,
			'A network error occurred. Please check your connection and try again.',
			{ details }
		)
};
