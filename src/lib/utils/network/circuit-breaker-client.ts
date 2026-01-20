/**
 * @fileoverview Client-Safe Circuit Breaker Pattern Implementation
 *
 * This module implements the Circuit Breaker pattern for client-side use.
 * It's a simplified version that doesn't depend on server-side environment variables.
 *
 * Key Features:
 * - Three states: CLOSED, OPEN, HALF_OPEN
 * - Configurable failure threshold and timeout
 * - Automatic recovery with half-open state
 * - TypeScript support with generic types
 *
 * @author bim
 * @version 1.0.0
 */

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
	/** Circuit is closed, requests are allowed */
	CLOSED = 'CLOSED',
	/** Circuit is open, requests are blocked */
	OPEN = 'OPEN',
	/** Circuit is half-open, testing if service has recovered */
	HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	/** Name of the circuit breaker for logging */
	name: string;
	/** Number of failures before opening circuit */
	failureThreshold: number;
	/** Time window for counting failures (ms) */
	failureWindow: number;
	/** Time to wait before trying half-open state (ms) */
	recoveryTimeout: number;
	/** Number of successful requests needed to close circuit from half-open */
	successThreshold: number;
	/** Function to determine if error should count as failure */
	shouldCountFailure?: (error: Error) => boolean;
	/** Function to determine if operation should be allowed */
	shouldAllowRequest?: (state: CircuitBreakerState) => boolean;
	/** Fallback function when circuit is open */
	fallback?: () => Promise<any>;
}

/**
 * Default circuit breaker configuration for client-side
 */
export const DEFAULT_CLIENT_CIRCUIT_BREAKER_CONFIG: Partial<CircuitBreakerConfig> = {
	failureThreshold: 5,
	failureWindow: 60000, // 1 minute
	recoveryTimeout: 30000, // 30 seconds
	successThreshold: 3,
	shouldCountFailure: defaultShouldCountFailure,
	shouldAllowRequest: defaultShouldAllowRequest
};

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
	state: CircuitBreakerState;
	failures: number;
	successes: number;
	requests: number;
	lastFailureTime: number | null;
	lastSuccessTime: number | null;
	nextAttemptTime: number | null;
}

/**
 * Default function to determine if error should count as failure
 */
function defaultShouldCountFailure(error: Error): boolean {
	// Don't count network errors as failures for client-side
	if (error.name === 'NetworkError' || error.name === 'TypeError') {
		return false;
	}
	return true;
}

/**
 * Default function to determine if operation should be allowed
 */
function defaultShouldAllowRequest(state: CircuitBreakerState): boolean {
	return state === CircuitBreakerState.CLOSED || state === CircuitBreakerState.HALF_OPEN;
}

/**
 * Circuit Breaker implementation for client-side use
 */
export class ClientCircuitBreaker {
	private config: CircuitBreakerConfig;
	private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
	private failures: number = 0;
	private successes: number = 0;
	private requests: number = 0;
	private lastFailureTime: number | null = null;
	private lastSuccessTime: number | null = null;
	private nextAttemptTime: number | null = null;
	private failureWindow: number[] = [];

	constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
		this.config = {
			...DEFAULT_CLIENT_CIRCUIT_BREAKER_CONFIG,
			...config
		} as CircuitBreakerConfig;
	}

	/**
	 * Execute an operation with circuit breaker protection
	 */
	async execute<T>(operation: () => Promise<T>): Promise<T> {
		this.requests++;

		// Check if request should be allowed
		if (!this.config.shouldAllowRequest!(this.state)) {
			if (this.config.fallback) {
				return await this.config.fallback();
			}
			throw new Error(`Circuit breaker '${this.config.name}' is ${this.state.toLowerCase()}`);
		}

		try {
			const result = await operation();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure(error as Error);
			throw error;
		}
	}

	/**
	 * Handle successful operation
	 */
	private onSuccess(): void {
		this.successes++;
		this.lastSuccessTime = Date.now();

		if (this.state === CircuitBreakerState.HALF_OPEN) {
			if (this.successes >= this.config.successThreshold) {
				this.setState(CircuitBreakerState.CLOSED);
			}
		}
	}

	/**
	 * Handle failed operation
	 */
	private onFailure(error: Error): void {
		if (this.config.shouldCountFailure!(error)) {
			this.failures++;
			this.lastFailureTime = Date.now();
			this.failureWindow.push(Date.now());

			// Clean up old failures outside the window
			const cutoff = Date.now() - this.config.failureWindow;
			this.failureWindow = this.failureWindow.filter((time) => time > cutoff);

			// Check if we should open the circuit
			if (this.failureWindow.length >= this.config.failureThreshold) {
				this.setState(CircuitBreakerState.OPEN);
			}
		}
	}

	/**
	 * Set circuit breaker state
	 */
	private setState(newState: CircuitBreakerState): void {
		if (this.state === newState) return;

		this.state = newState;

		if (newState === CircuitBreakerState.OPEN) {
			this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
		} else if (newState === CircuitBreakerState.CLOSED) {
			this.reset();
		}
	}

	/**
	 * Reset circuit breaker state
	 */
	private reset(): void {
		this.failures = 0;
		this.successes = 0;
		this.failureWindow = [];
		this.nextAttemptTime = null;
	}

	/**
	 * Check if we should try half-open state
	 * Currently unused but available for future state transition logic
	 */
	// private _shouldTryHalfOpen(): boolean {
	// 	return (
	// 		this.state === CircuitBreakerState.OPEN &&
	// 		this.nextAttemptTime !== null &&
	// 		Date.now() >= this.nextAttemptTime
	// 	);
	// }

	/**
	 * Manually open the circuit
	 */
	public open(): void {
		this.setState(CircuitBreakerState.OPEN);
	}

	/**
	 * Manually close the circuit
	 */
	public close(): void {
		this.setState(CircuitBreakerState.CLOSED);
	}

	/**
	 * Manually set to half-open state
	 */
	public halfOpen(): void {
		this.setState(CircuitBreakerState.HALF_OPEN);
	}

	/**
	 * Get circuit breaker statistics
	 */
	public getStats(): CircuitBreakerStats {
		return {
			state: this.state,
			failures: this.failures,
			successes: this.successes,
			requests: this.requests,
			lastFailureTime: this.lastFailureTime,
			lastSuccessTime: this.lastSuccessTime,
			nextAttemptTime: this.nextAttemptTime
		};
	}

	/**
	 * Get circuit breaker configuration
	 */
	public getConfig(): CircuitBreakerConfig {
		return { ...this.config };
	}
}

/**
 * Client-side Circuit Breaker Manager
 */
export class ClientCircuitBreakerManager {
	private circuitBreakers = new Map<string, ClientCircuitBreaker>();

	/**
	 * Get or create a circuit breaker
	 */
	public getCircuitBreaker(
		name: string,
		config?: Partial<CircuitBreakerConfig>
	): ClientCircuitBreaker {
		if (!this.circuitBreakers.has(name)) {
			this.circuitBreakers.set(name, new ClientCircuitBreaker({ name, ...config }));
		}
		return this.circuitBreakers.get(name)!;
	}

	/**
	 * Execute an operation with circuit breaker protection
	 */
	public async execute<T>(
		name: string,
		operation: () => Promise<T>,
		config?: Partial<CircuitBreakerConfig>
	): Promise<T> {
		const circuitBreaker = this.getCircuitBreaker(name, config);
		return await circuitBreaker.execute(operation);
	}

	/**
	 * Get all circuit breaker statistics
	 */
	public getAllStats(): Record<string, CircuitBreakerStats> {
		const stats: Record<string, CircuitBreakerStats> = {};
		for (const [name, circuitBreaker] of this.circuitBreakers) {
			stats[name] = circuitBreaker.getStats();
		}
		return stats;
	}

	/**
	 * Reset all circuit breakers
	 */
	public resetAll(): void {
		for (const circuitBreaker of this.circuitBreakers.values()) {
			circuitBreaker.close();
		}
	}
}

/**
 * Singleton instance for client-side use
 */
export const clientCircuitBreakerManager = new ClientCircuitBreakerManager();
