/**
 * Structured Logging System
 *
 * Provides consistent, structured logging across the application with
 * request correlation, contextual metadata, and proper log levels.
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3
}

export interface LogContext {
	requestId?: string;
	userId?: string;
	sessionId?: string;
	userAgent?: string;
	path?: string;
	method?: string;
	ip?: string;
	duration?: number;
	[key: string]: any;
}

export interface LogEntry {
	timestamp: string;
	level: keyof typeof LogLevel;
	message: string;
	context?: LogContext;
	error?: {
		name: string;
		message: string;
		stack?: string;
	};
	metadata?: Record<string, any>;
}

class Logger {
	private minLevel: LogLevel;
	private isDevelopment: boolean;

	constructor() {
		// Set log level from environment or default to INFO
		// Only access process.env on server-side
		const logLevel =
			(typeof process !== 'undefined' ? process.env.LOG_LEVEL?.toUpperCase() : null) || 'INFO';
		this.minLevel = LogLevel[logLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
		this.isDevelopment = this.minLevel === LogLevel.DEBUG;
	}

	private shouldLog(level: LogLevel): boolean {
		return level >= this.minLevel;
	}

	/**
	 * Custom JSON replacer that handles BigInt and other special values
	 */
	private jsonReplacer(_key: string, value: any): any {
		if (typeof value === 'bigint') {
			return value.toString() + 'n'; // Add 'n' suffix to indicate it was a BigInt
		}
		if (value instanceof Error) {
			return {
				name: value.name,
				message: value.message,
				stack: value.stack
			};
		}
		return value;
	}

	private formatEntry(entry: LogEntry): string {
		if (this.isDevelopment) {
			// Pretty format for development
			const emoji = {
				DEBUG: '🔍',
				INFO: 'ℹ️',
				WARN: '⚠️',
				ERROR: '❌'
			}[entry.level];

			let output = `${emoji} [${entry.level}] ${entry.message}`;

			if (entry.context?.requestId) {
				output += ` [req:${entry.context.requestId.slice(0, 8)}]`;
			}

			if (entry.context?.userId) {
				output += ` [user:${entry.context.userId.slice(0, 8)}]`;
			}

			if (entry.context?.duration) {
				output += ` [${entry.context.duration}ms]`;
			}

			return output;
		} else {
			// JSON format for production with BigInt support
			return JSON.stringify(entry, this.jsonReplacer.bind(this));
		}
	}

	private log(
		level: LogLevel,
		message: string,
		context?: LogContext,
		error?: Error,
		metadata?: Record<string, any>
	): void {
		if (!this.shouldLog(level)) return;

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: LogLevel[level] as keyof typeof LogLevel,
			message,
			...(context && { context }),
			...(metadata && { metadata })
		};

		if (error) {
			entry.error = {
				name: error.name,
				message: error.message,
				...(error.stack && { stack: error.stack })
			};
		}

		const formatted = this.formatEntry(entry);

		// Output to appropriate stream
		if (level >= LogLevel.ERROR) {
			console.error(formatted);
		} else if (level >= LogLevel.WARN) {
			console.warn(formatted);
		} else {
			console.log(formatted);
		}
	}

	debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
		this.log(LogLevel.DEBUG, message, context, undefined, metadata);
	}

	info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
		this.log(LogLevel.INFO, message, context, undefined, metadata);
	}

	warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
		this.log(LogLevel.WARN, message, context, undefined, metadata);
	}

	error(
		message: string,
		error?: Error,
		context?: LogContext,
		metadata?: Record<string, any>
	): void {
		this.log(LogLevel.ERROR, message, context, error, metadata);
	}

	// Helper methods for common patterns

	request(method: string, path: string, context: LogContext): void {
		this.info(`${method} ${path}`, context);
	}

	response(
		method: string,
		path: string,
		status: number,
		duration: number,
		context: LogContext
	): void {
		const level = status >= 400 ? LogLevel.WARN : LogLevel.INFO;
		this.log(level, `${method} ${path} ${status}`, { ...context, duration });
	}

	webauthn(action: string, success: boolean, context?: LogContext): void {
		const message = `WebAuthn ${action} ${success ? 'successful' : 'failed'}`;
		const level = success ? LogLevel.INFO : LogLevel.WARN;
		this.log(level, message, context);
	}

	starknet(action: string, success: boolean, txHash?: string, context?: LogContext): void {
		const message = `Starknet ${action} ${success ? 'successful' : 'failed'}`;
		const level = success ? LogLevel.INFO : LogLevel.ERROR;
		const metadata = txHash ? { txHash } : undefined;
		this.log(level, message, context, undefined, metadata);
	}

	database(action: string, success: boolean, duration?: number, context?: LogContext): void {
		const message = `Database ${action} ${success ? 'successful' : 'failed'}`;
		const level = success ? LogLevel.DEBUG : LogLevel.ERROR;
		const enrichedContext = duration ? { ...context, duration } : context;
		this.log(level, message, enrichedContext);
	}

	security(event: string, severity: 'low' | 'medium' | 'high', context?: LogContext): void {
		const level = {
			low: LogLevel.INFO,
			medium: LogLevel.WARN,
			high: LogLevel.ERROR
		}[severity];

		this.log(level, `Security event: ${event}`, context, undefined, {
			severity
		});
	}
}

// Global logger instance
export const logger = new Logger();

// Request ID generation utility
export function generateRequestId(): string {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Context helpers
export function createRequestContext(event: any): LogContext {
	return {
		requestId: event.locals?.requestId || generateRequestId(),
		path: event.url?.pathname || event.route?.id,
		method: event.request?.method,
		userAgent: event.request?.headers?.get('user-agent') || undefined,
		ip: event.getClientAddress ? event.getClientAddress() : 'unknown',
		userId: event.locals?.user?.id
	};
}

export function createUserContext(userId?: string, sessionId?: string): LogContext {
	return {
		...(userId && { userId }),
		...(sessionId && { sessionId })
	};
}
