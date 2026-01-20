/**
 * @fileoverview Refactored Circuit Breaker Implementation
 *
 * Modular circuit breaker implementation with pluggable strategies.
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { LightningErrors } from '$lib/errors/lightning';
import {
	CircuitBreakerState,
	CircuitBreakerConfig,
	CircuitBreakerStats,
	FailureDetectionStrategy,
	RecoveryStrategy,
	StateTransitionStrategy
} from './types';
import {
	ConfigurableFailureDetectionStrategy,
	ConfigurableRecoveryStrategy,
	ConfigurableStateTransitionStrategy,
	FailureDetectionMode,
	RecoveryMode,
	StateTransitionMode
} from './strategies';

/**
 * Circuit breaker implementation with pluggable strategies
 */
export class CircuitBreaker {
	private config: CircuitBreakerConfig;
	private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
	private failures: number = 0;
	private successes: number = 0;
	private requests: number = 0;
	private lastFailureTime: number | null = null;
	private lastSuccessTime: number | null = null;
	private nextAttemptTime: number | null = null;
	private failureWindow: number[] = [];

	// Strategy instances
	private failureDetectionStrategy: FailureDetectionStrategy;
	private recoveryStrategy: RecoveryStrategy;
	private stateTransitionStrategy: StateTransitionStrategy;

	constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
		// Merge with defaults
		this.config = {
			failureThreshold: 5,
			failureWindow: 60000,
			recoveryTimeout: 30000,
			successThreshold: 3,
			...config
		} as CircuitBreakerConfig;

		// Initialize strategies with default configurations
		this.failureDetectionStrategy = new ConfigurableFailureDetectionStrategy({
			mode: FailureDetectionMode.DEFAULT
		});
		this.recoveryStrategy = new ConfigurableRecoveryStrategy({
			mode: RecoveryMode.DEFAULT
		});
		this.stateTransitionStrategy = new ConfigurableStateTransitionStrategy({
			mode: StateTransitionMode.DEFAULT
		});

		// Override with custom strategies if provided
		if (config.shouldCountFailure) {
			this.failureDetectionStrategy = {
				shouldCountFailure: config.shouldCountFailure
			};
		}

		if (config.shouldAllowRequest) {
			this.recoveryStrategy = {
				shouldAllowRequest: config.shouldAllowRequest,
				calculateRecoveryTime: (currentTime: number, cfg: CircuitBreakerConfig) =>
					currentTime + cfg.recoveryTimeout
			};
		}

		logger.info(`Circuit breaker initialized: ${this.config.name}`, {
			circuitBreaker: this.config.name,
			config: this.config
		});
	}

	/**
	 * Set failure detection strategy
	 */
	setFailureDetectionStrategy(strategy: FailureDetectionStrategy): void {
		this.failureDetectionStrategy = strategy;
	}

	/**
	 * Set recovery strategy
	 */
	setRecoveryStrategy(strategy: RecoveryStrategy): void {
		this.recoveryStrategy = strategy;
	}

	/**
	 * Set state transition strategy
	 */
	setStateTransitionStrategy(strategy: StateTransitionStrategy): void {
		this.stateTransitionStrategy = strategy;
	}

	/**
	 * Execute operation with circuit breaker protection
	 */
	async execute<T>(operation: () => Promise<T>): Promise<T> {
		this.requests++;

		// Check if we should transition to half-open
		this.checkForHalfOpenTransition();

		// Check if request should be allowed
		if (!this.recoveryStrategy.shouldAllowRequest(this.state)) {
			const error = LightningErrors.serviceUnavailable();

			// Try fallback if available
			if (this.config.fallback) {
				logger.info(`Using fallback for ${this.config.name}`, {
					circuitBreaker: this.config.name,
					state: this.state
				});
				return await this.config.fallback();
			}

			throw error;
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

		// Check if we should close the circuit
		if (
			this.stateTransitionStrategy.shouldCloseCircuit(
				this.successes,
				this.config.successThreshold,
				this.state
			)
		) {
			this.setState(CircuitBreakerState.CLOSED);
			this.reset();
		}

		// Notify adaptive strategies
		if ('recordSuccess' in this.recoveryStrategy) {
			(this.recoveryStrategy as any).recordSuccess();
		}

		logger.debug(`Circuit breaker success: ${this.config.name}`, {
			circuitBreaker: this.config.name,
			state: this.state,
			successes: this.successes,
			successThreshold: this.config.successThreshold
		});
	}

	/**
	 * Handle failed operation
	 */
	private onFailure(error: Error): void {
		if (!this.failureDetectionStrategy.shouldCountFailure(error)) {
			logger.debug(`Error not counted as failure for ${this.config.name}`, {
				circuitBreaker: this.config.name,
				error: error.message
			});
			return;
		}

		this.failures++;
		this.lastFailureTime = Date.now();

		// Add failure to window
		this.failureWindow.push(this.lastFailureTime);

		// Clean up old failures outside window
		const windowStart = this.lastFailureTime - this.config.failureWindow;
		this.failureWindow = this.failureWindow.filter((time) => time > windowStart);

		// Check if we should open circuit
		if (
			this.stateTransitionStrategy.shouldOpenCircuit(
				this.failureWindow.length,
				this.config.failureThreshold,
				this.state,
				this.requests
			)
		) {
			this.setState(CircuitBreakerState.OPEN);
			this.nextAttemptTime = this.recoveryStrategy.calculateRecoveryTime(Date.now(), this.config);
		}

		// Notify adaptive strategies
		if ('recordFailure' in this.recoveryStrategy) {
			(this.recoveryStrategy as any).recordFailure();
		}

		logger.warn(`Circuit breaker failure: ${this.config.name}`, {
			circuitBreaker: this.config.name,
			state: this.state,
			failures: this.failures,
			failureWindow: this.failureWindow.length,
			failureThreshold: this.config.failureThreshold,
			error: error.message
		});
	}

	/**
	 * Check if circuit should transition to half-open
	 */
	private checkForHalfOpenTransition(): void {
		if (
			this.stateTransitionStrategy.shouldTryHalfOpen(Date.now(), this.nextAttemptTime, this.state)
		) {
			this.setState(CircuitBreakerState.HALF_OPEN);
			this.successes = 0;
		}
	}

	/**
	 * Set circuit breaker state
	 */
	private setState(newState: CircuitBreakerState): void {
		const oldState = this.state;
		this.state = newState;

		if (oldState !== newState) {
			logger.info(`Circuit breaker state changed: ${this.config.name}`, {
				circuitBreaker: this.config.name,
				oldState,
				newState,
				failures: this.failures,
				successes: this.successes
			});

			// Report state change to monitoring
			monitoring.addBreadcrumb(
				`Circuit breaker ${this.config.name} state changed from ${oldState} to ${newState}`,
				'circuit-breaker',
				{
					circuitBreaker: this.config.name,
					oldState,
					newState,
					failures: this.failures,
					successes: this.successes
				}
			);

			// Reset exponential backoff on recovery
			if (newState === CircuitBreakerState.CLOSED && 'reset' in this.recoveryStrategy) {
				(this.recoveryStrategy as any).reset();
			}
		}
	}

	/**
	 * Reset circuit breaker statistics
	 */
	private reset(): void {
		this.failures = 0;
		this.successes = 0;
		this.failureWindow = [];
		this.nextAttemptTime = null;

		logger.info(`Circuit breaker reset: ${this.config.name}`, {
			circuitBreaker: this.config.name,
			state: this.state
		});
	}

	/**
	 * Manually open circuit breaker
	 */
	public open(): void {
		this.setState(CircuitBreakerState.OPEN);
		this.nextAttemptTime = this.recoveryStrategy.calculateRecoveryTime(Date.now(), this.config);
	}

	/**
	 * Manually close circuit breaker
	 */
	public close(): void {
		this.setState(CircuitBreakerState.CLOSED);
		this.reset();
	}

	/**
	 * Manually set half-open state
	 */
	public halfOpen(): void {
		this.setState(CircuitBreakerState.HALF_OPEN);
		this.successes = 0;
	}

	/**
	 * Get current statistics
	 */
	public getStats(): CircuitBreakerStats {
		// Check for state transitions
		this.checkForHalfOpenTransition();

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
	 * Get configuration
	 */
	public getConfig(): CircuitBreakerConfig {
		return { ...this.config };
	}
}
