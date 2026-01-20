/**
 * @fileoverview Lightning Webhook and Notification Errors
 *
 * Error classes and factory functions for webhook-related failures.
 */

import { LightningError } from './base';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Webhook and notification errors
 */
export class LightningWebhookError extends LightningError {
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
 * Factory functions for webhook errors
 */
export const WebhookErrors = {
	webhookFailed: (url: string, reason?: string) =>
		new LightningWebhookError(
			LightningErrorCode.WEBHOOK_FAILED,
			`Webhook failed: ${url} - ${reason || 'Unknown error'}`,
			'Webhook notification failed. This may affect status updates.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.RETRY],
			{ url, reason }
		),

	webhookInvalidSignature: (signature: string) =>
		new LightningWebhookError(
			LightningErrorCode.WEBHOOK_INVALID_SIGNATURE,
			`Invalid webhook signature: ${signature}`,
			'Webhook signature validation failed',
			ErrorSeverity.HIGH,
			[RecoveryAction.CONTACT_SUPPORT],
			{ signature }
		),

	sseConnectionFailed: (reason?: string) =>
		new LightningWebhookError(
			LightningErrorCode.SSE_CONNECTION_FAILED,
			`Server-Sent Events connection failed: ${reason || 'Unknown error'}`,
			'Real-time updates are unavailable. Please refresh the page to check status.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.REFRESH_PAGE],
			{ reason }
		)
};
