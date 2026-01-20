/**
 * Error Tracking and Monitoring Integration
 *
 * Provides custom error tracking for production monitoring.
 */

import { logger, type LogContext } from './logger';

export interface MonitoringConfig {
	environment: string;
	release: string;
}

class MonitoringService {
	private initialized = false;

	init(config: MonitoringConfig) {
		if (this.initialized) return;

		this.initialized = true;

		logger.info('Monitoring service initialized', {
			environment: config.environment,
			release: config.release
		});
	}

	// Error tracking methods
	captureException(error: Error, context?: LogContext): string | undefined {
		logger.error('Exception captured', error, context);
		return undefined;
	}

	captureMessage(
		message: string,
		level: 'info' | 'warning' | 'error' = 'info',
		context?: LogContext
	): string | undefined {
		switch (level) {
			case 'error':
				logger.error(`Message: ${message}`, new Error(message), context);
				break;
			case 'warning':
				logger.warn(`Message: ${message}`, context);
				break;
			default:
				logger.info(`Message: ${message}`, context);
		}
		return undefined;
	}

	// User context management
	setUser(userId: string, email?: string, username?: string) {
		logger.debug('User context set for monitoring', {
			userId,
			email,
			username
		});
	}

	clearUser() {
		logger.debug('User context cleared from monitoring');
	}

	// Custom event tracking
	addBreadcrumb(message: string, category: string, data?: Record<string, any>) {
		logger.debug(`Breadcrumb [${category}]: ${message}`, data);
	}

	// Performance monitoring
	startTransaction(name: string, op: string) {
		logger.debug(`Starting transaction: ${name} (${op})`);
		return null;
	}

	// Operation timing
	trackOperationTime(operation: string, timeMs: number) {
		logger.debug(`Operation ${operation} completed in ${timeMs}ms`);
	}

	// Counter tracking
	incrementCounter(metric: string, count: number = 1) {
		logger.debug(`Counter ${metric} incremented by ${count}`);
	}

	// Error event recording
	recordErrorEvent(event: string, data?: Record<string, any>) {
		logger.error(`Error event: ${event}`, new Error(event), data);
	}

	// Business logic monitoring
	trackWebAuthnEvent(
		action: 'registration' | 'authentication',
		success: boolean,
		error?: Error,
		context?: LogContext
	) {
		const message = `WebAuthn ${action} ${success ? 'successful' : 'failed'}`;

		if (success) {
			logger.webauthn(action, true, context);
			this.addBreadcrumb(message, 'webauthn', { action, success });
		} else {
			logger.webauthn(action, false, context);
			if (error) {
				this.captureException(error, { ...context, webauthnAction: action });
			} else {
				this.captureMessage(message, 'warning', context);
			}
		}
	}

	trackStarknetEvent(
		action: string,
		success: boolean,
		txHash?: string,
		error?: Error,
		context?: LogContext
	) {
		const message = `Starknet ${action} ${success ? 'successful' : 'failed'}`;

		if (success) {
			logger.starknet(action, true, txHash, context);
			this.addBreadcrumb(message, 'starknet', { action, success, txHash });
		} else {
			logger.starknet(action, false, txHash, context);
			if (error) {
				this.captureException(error, {
					...context,
					starknetAction: action,
					txHash
				});
			} else {
				this.captureMessage(message, 'error', context);
			}
		}
	}

	trackDatabaseEvent(
		action: string,
		success: boolean,
		duration?: number,
		error?: Error,
		context?: LogContext
	) {
		if (success) {
			logger.database(action, true, duration, context);
		} else {
			logger.database(action, false, duration, context);
			if (error) {
				this.captureException(error, {
					...context,
					databaseAction: action,
					duration: duration || 0
				});
			}
		}
	}

	trackSecurityEvent(event: string, severity: 'low' | 'medium' | 'high', context?: LogContext) {
		logger.security(event, severity, context);

		const level = {
			low: 'info',
			medium: 'warning',
			high: 'error'
		}[severity] as 'info' | 'warning' | 'error';

		this.captureMessage(`Security event: ${event}`, level, {
			...context,
			severity
		});
	}

	// Service event tracking for Atomiq and other services
	recordServiceEvent(event: string, data?: Record<string, any>, context?: LogContext) {
		logger.info(`Service event: ${event}`, {
			...context,
			serviceEvent: event,
			...data
		});
		this.addBreadcrumb(`Service: ${event}`, 'service', { event, ...data });
	}
}

// Global monitoring service instance
export const monitoring = new MonitoringService();

// Monitoring utilities
export function withMonitoring<T extends (...args: any[]) => any>(
	fn: T,
	name: string,
	category: string = 'function'
): T {
	return ((...args: any[]) => {
		// Start transaction for monitoring (available for future use)
		monitoring.startTransaction(name, category);

		try {
			const result = fn(...args);

			// Handle promises
			if (result && typeof result.then === 'function') {
				return result
					.then((value: any) => {
						return value;
					})
					.catch((error: Error) => {
						monitoring.captureException(error, { functionName: name });
						throw error;
					});
			}

			return result;
		} catch (error) {
			monitoring.captureException(error as Error, { functionName: name });
			throw error;
		}
	}) as T;
}

// Error boundary helpers
export function handleError(error: Error, context?: LogContext): string | undefined {
	logger.error('Unhandled error', error, context);
	return monitoring.captureException(error, context);
}

// Initialize monitoring from environment
export function initMonitoringFromEnv() {
	// Only initialize on server-side - comprehensive browser safety check
	if (
		typeof process === 'undefined' ||
		typeof window !== 'undefined' ||
		typeof document !== 'undefined'
	) {
		return;
	}

	// Additional safety check - ensure we're in a Node.js environment
	if (typeof process === 'undefined' || !process.env) {
		return;
	}

	const config: MonitoringConfig = {
		release: process.env.RELEASE || process.env.npm_package_version || '1.0.0',
		environment: process.env.NODE_ENV || 'development'
	};

	monitoring.init(config);
}
