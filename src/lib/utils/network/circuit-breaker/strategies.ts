/**
 * @fileoverview Consolidated Circuit Breaker Strategies
 *
 * Replaces 13 micro-strategy classes with 3 configurable strategy classes.
 * This provides the same functionality with better maintainability.
 */

import { CircuitBreakerState, type CircuitBreakerConfig } from './types';
import { LightningError, LightningErrorCode } from '$lib/errors/lightning';

// ===== RECOVERY STRATEGIES =====

export enum RecoveryMode {
	DEFAULT = 'default',
	EXPONENTIAL_BACKOFF = 'exponential_backoff',
	JITTERED = 'jittered',
	ADAPTIVE = 'adaptive',
	TIME_BASED = 'time_based'
}

export interface RecoveryStrategyConfig {
	mode: RecoveryMode;
	// Exponential backoff options
	maxBackoffTime?: number;
	backoffMultiplier?: number;
	// Jitter options
	jitterFactor?: number;
	// Adaptive options
	adaptationFactor?: number;
	// Time-based options
	timeSlots?: Map<string, number>;
}

export class ConfigurableRecoveryStrategy {
	private attempts = 0;
	private recentSuccesses = 0;
	private recentFailures = 0;

	constructor(private config: RecoveryStrategyConfig) {}

	shouldAllowRequest(state: CircuitBreakerState): boolean {
		return state === CircuitBreakerState.CLOSED || state === CircuitBreakerState.HALF_OPEN;
	}

	calculateRecoveryTime(currentTime: number, circuitConfig: CircuitBreakerConfig): number {
		switch (this.config.mode) {
			case RecoveryMode.EXPONENTIAL_BACKOFF:
				return this.calculateExponentialBackoff(currentTime, circuitConfig);

			case RecoveryMode.JITTERED:
				return this.calculateJitteredRecovery(currentTime, circuitConfig);

			case RecoveryMode.ADAPTIVE:
				return this.calculateAdaptiveRecovery(currentTime, circuitConfig);

			case RecoveryMode.TIME_BASED:
				return this.calculateTimeBasedRecovery(currentTime, circuitConfig);

			case RecoveryMode.DEFAULT:
			default:
				return currentTime + circuitConfig.recoveryTimeout;
		}
	}

	private calculateExponentialBackoff(currentTime: number, config: CircuitBreakerConfig): number {
		this.attempts++;
		const maxBackoffTime = this.config.maxBackoffTime || 300000; // 5 minutes
		const backoffMultiplier = this.config.backoffMultiplier || 2;

		const backoffTime = Math.min(
			config.recoveryTimeout * Math.pow(backoffMultiplier, this.attempts - 1),
			maxBackoffTime
		);
		return currentTime + backoffTime;
	}

	private calculateJitteredRecovery(currentTime: number, config: CircuitBreakerConfig): number {
		const jitterFactor = this.config.jitterFactor || 0.1;
		const jitter = config.recoveryTimeout * jitterFactor * Math.random();
		return currentTime + config.recoveryTimeout + jitter;
	}

	private calculateAdaptiveRecovery(currentTime: number, config: CircuitBreakerConfig): number {
		const adaptationFactor = this.config.adaptationFactor || 0.5;
		const failureRatio = this.recentFailures / (this.recentSuccesses + this.recentFailures + 1);
		const adaptedTimeout = config.recoveryTimeout * (1 + failureRatio * adaptationFactor);
		return currentTime + adaptedTimeout;
	}

	private calculateTimeBasedRecovery(currentTime: number, config: CircuitBreakerConfig): number {
		const timeSlots =
			this.config.timeSlots ||
			new Map([
				['business', 5000], // 9 AM - 5 PM: 5 seconds
				['evening', 10000], // 5 PM - 11 PM: 10 seconds
				['night', 30000] // 11 PM - 9 AM: 30 seconds
			]);

		const hour = new Date(currentTime).getHours();
		let timeSlot = 'night';

		if (hour >= 9 && hour < 17) {
			timeSlot = 'business';
		} else if (hour >= 17 && hour < 23) {
			timeSlot = 'evening';
		}

		const recoveryTimeout = timeSlots.get(timeSlot) || config.recoveryTimeout;
		return currentTime + recoveryTimeout;
	}

	reset(): void {
		this.attempts = 0;
	}

	recordSuccess(): void {
		this.recentSuccesses++;
		this.boundHistory();
	}

	recordFailure(): void {
		this.recentFailures++;
		this.boundHistory();
	}

	private boundHistory(): void {
		if (this.recentSuccesses > 100 || this.recentFailures > 100) {
			this.recentSuccesses = Math.floor(this.recentSuccesses * 0.9);
			this.recentFailures = Math.floor(this.recentFailures * 0.9);
		}
	}
}

// ===== STATE TRANSITION STRATEGIES =====

export enum StateTransitionMode {
	DEFAULT = 'default',
	CONSERVATIVE = 'conservative',
	AGGRESSIVE = 'aggressive',
	PERCENTAGE_BASED = 'percentage_based'
}

export interface StateTransitionStrategyConfig {
	mode: StateTransitionMode;
	// Conservative/Aggressive options
	multiplier?: number;
	// Percentage-based options
	failurePercentageThreshold?: number;
	minimumRequests?: number;
}

export class ConfigurableStateTransitionStrategy {
	constructor(private config: StateTransitionStrategyConfig) {}

	shouldOpenCircuit(
		failureCount: number,
		threshold: number,
		state: CircuitBreakerState,
		totalRequests = 0
	): boolean {
		switch (this.config.mode) {
			case StateTransitionMode.CONSERVATIVE:
				return this.shouldOpenConservative(failureCount, threshold, state);

			case StateTransitionMode.AGGRESSIVE:
				return this.shouldOpenAggressive(failureCount, threshold, state);

			case StateTransitionMode.PERCENTAGE_BASED:
				return this.shouldOpenPercentage(failureCount, threshold, state, totalRequests);

			case StateTransitionMode.DEFAULT:
			default:
				return this.shouldOpenDefault(failureCount, threshold, state);
		}
	}

	shouldCloseCircuit(successCount: number, threshold: number, state: CircuitBreakerState): boolean {
		if (state !== CircuitBreakerState.HALF_OPEN) {
			return false;
		}

		switch (this.config.mode) {
			case StateTransitionMode.CONSERVATIVE:
				const conservativeThreshold = threshold * (this.config.multiplier || 2);
				return successCount >= conservativeThreshold;

			case StateTransitionMode.AGGRESSIVE:
				const aggressiveThreshold = Math.max(
					1,
					Math.ceil(threshold * (this.config.multiplier || 0.5))
				);
				return successCount >= aggressiveThreshold;

			case StateTransitionMode.PERCENTAGE_BASED:
			case StateTransitionMode.DEFAULT:
			default:
				return successCount >= threshold;
		}
	}

	shouldTryHalfOpen(
		currentTime: number,
		nextAttemptTime: number | null,
		state: CircuitBreakerState
	): boolean {
		return (
			state === CircuitBreakerState.OPEN &&
			nextAttemptTime !== null &&
			currentTime >= nextAttemptTime
		);
	}

	private shouldOpenDefault(
		failureCount: number,
		threshold: number,
		state: CircuitBreakerState
	): boolean {
		return (
			(state === CircuitBreakerState.CLOSED && failureCount >= threshold) ||
			(state === CircuitBreakerState.HALF_OPEN && failureCount > 0)
		);
	}

	private shouldOpenConservative(
		failureCount: number,
		threshold: number,
		state: CircuitBreakerState
	): boolean {
		const multiplier = this.config.multiplier || 2;
		const adjustedThreshold = Math.ceil(threshold / multiplier);
		return (
			(state === CircuitBreakerState.CLOSED && failureCount >= adjustedThreshold) ||
			(state === CircuitBreakerState.HALF_OPEN && failureCount > 0)
		);
	}

	private shouldOpenAggressive(
		failureCount: number,
		threshold: number,
		state: CircuitBreakerState
	): boolean {
		const multiplier = this.config.multiplier || 0.5;
		const adjustedThreshold = Math.max(1, Math.ceil(threshold * multiplier));
		return (
			(state === CircuitBreakerState.CLOSED && failureCount >= adjustedThreshold) ||
			(state === CircuitBreakerState.HALF_OPEN && failureCount > 0)
		);
	}

	private shouldOpenPercentage(
		failureCount: number,
		threshold: number,
		state: CircuitBreakerState,
		totalRequests: number
	): boolean {
		const failurePercentageThreshold = this.config.failurePercentageThreshold || 0.5;
		const minimumRequests = this.config.minimumRequests || 10;

		if (totalRequests < minimumRequests) {
			return false;
		}

		const failureRate = failureCount / totalRequests;
		return (
			(state === CircuitBreakerState.CLOSED && failureRate >= failurePercentageThreshold) ||
			(state === CircuitBreakerState.HALF_OPEN && failureCount > 0)
		);
	}
}

// ===== FAILURE DETECTION STRATEGIES =====

export enum FailureDetectionMode {
	DEFAULT = 'default',
	STRICT = 'strict',
	LENIENT = 'lenient',
	HTTP_FOCUSED = 'http_focused',
	CUSTOM = 'custom'
}

export interface FailureDetectionStrategyConfig {
	mode: FailureDetectionMode;
	// HTTP-focused options
	failureStatusCodes?: number[];
	// Custom predicate
	customPredicate?: (error: Error) => boolean;
}

export class ConfigurableFailureDetectionStrategy {
	constructor(private config: FailureDetectionStrategyConfig) {}

	shouldCountFailure(error: Error): boolean {
		switch (this.config.mode) {
			case FailureDetectionMode.STRICT:
				return this.shouldCountFailureStrict(error);

			case FailureDetectionMode.LENIENT:
				return this.shouldCountFailureLenient(error);

			case FailureDetectionMode.HTTP_FOCUSED:
				return this.shouldCountFailureHttp(error);

			case FailureDetectionMode.CUSTOM:
				return this.config.customPredicate ? this.config.customPredicate(error) : false;

			case FailureDetectionMode.DEFAULT:
			default:
				return this.shouldCountFailureDefault(error);
		}
	}

	private shouldCountFailureDefault(error: Error): boolean {
		// Don't count validation errors as failures
		if (error instanceof LightningError) {
			const nonFailureErrors = [
				LightningErrorCode.INVALID_AMOUNT,
				LightningErrorCode.INVALID_ADDRESS,
				LightningErrorCode.UNSUPPORTED_ASSET,
				LightningErrorCode.VALIDATION_ERROR,
				LightningErrorCode.INVALID_PARAMETERS
			];
			return !nonFailureErrors.includes(error.code);
		}

		// Count HTTP 5xx errors as failures
		if (error.message.includes('HTTP')) {
			const statusMatch = error.message.match(/HTTP (\d+)/);
			if (statusMatch) {
				const status = parseInt(statusMatch[1]);
				return status >= 500;
			}
		}

		// Count network errors as failures
		const networkErrors = [
			'NETWORK_ERROR',
			'TIMEOUT_ERROR',
			'CONNECTION_FAILED',
			'ECONNRESET',
			'ECONNREFUSED',
			'ETIMEDOUT'
		];

		return networkErrors.some(
			(errorType) => error.message.includes(errorType) || error.name.includes(errorType)
		);
	}

	private shouldCountFailureStrict(error: Error): boolean {
		// Only exclude explicit non-failures
		if (error instanceof LightningError) {
			const explicitNonFailures = [
				LightningErrorCode.INVALID_AMOUNT,
				LightningErrorCode.INVALID_ADDRESS,
				LightningErrorCode.VALIDATION_ERROR
			];
			return !explicitNonFailures.includes(error.code);
		}

		// Count all other errors as failures
		return true;
	}

	private shouldCountFailureLenient(error: Error): boolean {
		if (error instanceof LightningError) {
			const criticalErrors = [
				LightningErrorCode.SERVICE_UNAVAILABLE,
				LightningErrorCode.TIMEOUT_ERROR,
				LightningErrorCode.CONNECTION_FAILED,
				LightningErrorCode.NETWORK_ERROR,
				LightningErrorCode.INTERNAL_ERROR
			];
			return criticalErrors.includes(error.code);
		}

		// Only count severe network errors
		const severeNetworkErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'];
		return severeNetworkErrors.some(
			(errorType) => error.message.includes(errorType) || error.name.includes(errorType)
		);
	}

	private shouldCountFailureHttp(error: Error): boolean {
		const failureStatusCodes = new Set(this.config.failureStatusCodes || [500, 502, 503, 504]);

		// Check for HTTP status codes
		if (error.message.includes('HTTP')) {
			const statusMatch = error.message.match(/HTTP (\d+)/);
			if (statusMatch) {
				const status = parseInt(statusMatch[1]);
				return failureStatusCodes.has(status);
			}
		}

		// Check for network errors
		const networkErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'];
		return networkErrors.some(
			(errorType) => error.message.includes(errorType) || error.name.includes(errorType)
		);
	}
}
