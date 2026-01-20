/**
 * @fileoverview Circuit Breaker Types and Interfaces
 *
 * Core types and interfaces for the circuit breaker implementation.
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
 * Failure detection strategy interface
 */
export interface FailureDetectionStrategy {
	shouldCountFailure(error: Error): boolean;
}

/**
 * Recovery strategy interface
 */
export interface RecoveryStrategy {
	shouldAllowRequest(state: CircuitBreakerState): boolean;
	calculateRecoveryTime(currentTime: number, config: CircuitBreakerConfig): number;
}

/**
 * State transition strategy interface
 */
export interface StateTransitionStrategy {
	shouldOpenCircuit(
		failureCount: number,
		threshold: number,
		state: CircuitBreakerState,
		totalRequests?: number
	): boolean;
	shouldCloseCircuit(successCount: number, threshold: number, state: CircuitBreakerState): boolean;
	shouldTryHalfOpen(
		currentTime: number,
		nextAttemptTime: number | null,
		state: CircuitBreakerState
	): boolean;
}

// Explicit re-exports for TypeScript module resolution
export type {
	CircuitBreakerConfig,
	CircuitBreakerStats,
	FailureDetectionStrategy,
	RecoveryStrategy,
	StateTransitionStrategy
};
