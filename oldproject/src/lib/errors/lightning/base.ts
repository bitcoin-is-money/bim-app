/**
 * @fileoverview Base Lightning Error Classes
 *
 * Core error class and shared functionality for Lightning Network errors.
 */

// import { logger } from '$lib/utils/logger';
// import { monitoring } from '$lib/utils/monitoring';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Base Lightning Network error class
 */
export abstract class LightningError extends Error {
	public readonly code: LightningErrorCode;
	public readonly severity: ErrorSeverity;
	public readonly userMessage: string;
	public readonly recoveryActions: RecoveryAction[];
	public readonly timestamp: Date;
	public readonly context: Record<string, any>;

	constructor(
		code: LightningErrorCode,
		message: string,
		userMessage: string,
		severity: ErrorSeverity,
		recoveryActions: RecoveryAction[] = [],
		context: Record<string, any> = {}
	) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.severity = severity;
		this.userMessage = userMessage;
		this.recoveryActions = recoveryActions;
		this.timestamp = new Date();
		this.context = context;

		// Capture stack trace
		Error.captureStackTrace?.(this, this.constructor);

		// Log error automatically
		this.logError();

		// Report to monitoring system
		this.reportToMonitoring();
	}

	private logError(): void {
		const logContext = {
			errorCode: this.code,
			severity: this.severity,
			userMessage: this.userMessage,
			recoveryActions: this.recoveryActions,
			...this.context
		};

		// Temporarily disabled logging to fix build
		console.error(`Lightning Error: ${this.message}`, logContext);
	}

	private reportToMonitoring(): void {
		if (this.severity === ErrorSeverity.CRITICAL || this.severity === ErrorSeverity.HIGH) {
			// Temporarily disabled monitoring to fix build
			console.error('Monitoring disabled:', {
				errorCode: this.code,
				severity: this.severity,
				userMessage: this.userMessage,
				...this.context
			});
		}
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
			recoveryActions: this.recoveryActions,
			timestamp: this.timestamp.toISOString(),
			context: this.context
		};
	}
}
