/**
 * @fileoverview Circuit Breaker Configuration Presets
 *
 * Predefined configurations for different use cases and services.
 */

import { CIRCUIT_BREAKER } from '$lib/constants';
import { CircuitBreakerConfig } from './types';
import {
	DefaultFailureDetectionStrategy,
	HttpFailureDetectionStrategy,
	LenientFailureDetectionStrategy
} from './failure-strategies';
import {
	DefaultRecoveryStrategy,
	ExponentialBackoffRecoveryStrategy,
	JitteredRecoveryStrategy
} from './recovery-strategies';

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Partial<CircuitBreakerConfig> = {
	failureThreshold: CIRCUIT_BREAKER.FAILURE_THRESHOLD,
	failureWindow: CIRCUIT_BREAKER.MONITOR_WINDOW,
	recoveryTimeout: CIRCUIT_BREAKER.RECOVERY_TIMEOUT,
	successThreshold: 3,
	shouldCountFailure: new DefaultFailureDetectionStrategy().shouldCountFailure.bind(
		new DefaultFailureDetectionStrategy()
	),
	shouldAllowRequest: new DefaultRecoveryStrategy().shouldAllowRequest.bind(
		new DefaultRecoveryStrategy()
	)
};

/**
 * Predefined circuit breaker configurations for different services
 */
export const CIRCUIT_BREAKER_CONFIGS = {
	/** Lightning Network operations - Conservative settings */
	lightning: {
		failureThreshold: CIRCUIT_BREAKER.FAILURE_THRESHOLD,
		failureWindow: CIRCUIT_BREAKER.MONITOR_WINDOW,
		recoveryTimeout: CIRCUIT_BREAKER.RECOVERY_TIMEOUT,
		successThreshold: 3,
		shouldCountFailure: new DefaultFailureDetectionStrategy().shouldCountFailure.bind(
			new DefaultFailureDetectionStrategy()
		),
		shouldAllowRequest: new DefaultRecoveryStrategy().shouldAllowRequest.bind(
			new DefaultRecoveryStrategy()
		)
	} as Partial<CircuitBreakerConfig>,

	/** External API calls - Standard settings with HTTP focus */
	api: {
		failureThreshold: 3,
		failureWindow: 30_000, // 30 seconds
		recoveryTimeout: 10_000, // 10 seconds
		successThreshold: 2,
		shouldCountFailure: new HttpFailureDetectionStrategy().shouldCountFailure.bind(
			new HttpFailureDetectionStrategy()
		),
		shouldAllowRequest: new JitteredRecoveryStrategy().shouldAllowRequest.bind(
			new JitteredRecoveryStrategy()
		)
	} as Partial<CircuitBreakerConfig>,

	/** Pricing services - Lenient settings with exponential backoff */
	pricing: {
		failureThreshold: 3,
		failureWindow: CIRCUIT_BREAKER.MONITOR_WINDOW,
		recoveryTimeout: 15_000, // 15 seconds
		successThreshold: 2,
		shouldCountFailure: new LenientFailureDetectionStrategy().shouldCountFailure.bind(
			new LenientFailureDetectionStrategy()
		),
		shouldAllowRequest: new ExponentialBackoffRecoveryStrategy().shouldAllowRequest.bind(
			new ExponentialBackoffRecoveryStrategy()
		)
	} as Partial<CircuitBreakerConfig>,

	/** Webhook operations - Fast recovery settings */
	webhook: {
		failureThreshold: 2,
		failureWindow: 30_000, // 30 seconds
		recoveryTimeout: 5_000, // 5 seconds
		successThreshold: 1,
		shouldCountFailure: new HttpFailureDetectionStrategy([
			500, 502, 503, 504
		]).shouldCountFailure.bind(new HttpFailureDetectionStrategy([500, 502, 503, 504])),
		shouldAllowRequest: new DefaultRecoveryStrategy().shouldAllowRequest.bind(
			new DefaultRecoveryStrategy()
		)
	} as Partial<CircuitBreakerConfig>,

	/** Database operations - Conservative settings */
	database: {
		failureThreshold: 5,
		failureWindow: 60_000, // 1 minute
		recoveryTimeout: 30_000, // 30 seconds
		successThreshold: 3,
		shouldCountFailure: new DefaultFailureDetectionStrategy().shouldCountFailure.bind(
			new DefaultFailureDetectionStrategy()
		),
		shouldAllowRequest: new ExponentialBackoffRecoveryStrategy(
			300_000,
			1.5
		).shouldAllowRequest.bind(new ExponentialBackoffRecoveryStrategy(300_000, 1.5))
	} as Partial<CircuitBreakerConfig>,

	/** Cache operations - Very lenient settings */
	cache: {
		failureThreshold: 10,
		failureWindow: 120_000, // 2 minutes
		recoveryTimeout: 5_000, // 5 seconds
		successThreshold: 1,
		shouldCountFailure: new LenientFailureDetectionStrategy().shouldCountFailure.bind(
			new LenientFailureDetectionStrategy()
		),
		shouldAllowRequest: new DefaultRecoveryStrategy().shouldAllowRequest.bind(
			new DefaultRecoveryStrategy()
		)
	} as Partial<CircuitBreakerConfig>,

	/** External payment providers - Strict settings */
	payment: {
		failureThreshold: 2,
		failureWindow: 60_000, // 1 minute
		recoveryTimeout: 60_000, // 1 minute
		successThreshold: 5,
		shouldCountFailure: new DefaultFailureDetectionStrategy().shouldCountFailure.bind(
			new DefaultFailureDetectionStrategy()
		),
		shouldAllowRequest: new ExponentialBackoffRecoveryStrategy(600_000, 2).shouldAllowRequest.bind(
			new ExponentialBackoffRecoveryStrategy(600_000, 2)
		)
	} as Partial<CircuitBreakerConfig>,

	/** Real-time services - Fast response settings */
	realtime: {
		failureThreshold: 3,
		failureWindow: 15_000, // 15 seconds
		recoveryTimeout: 3_000, // 3 seconds
		successThreshold: 1,
		shouldCountFailure: new DefaultFailureDetectionStrategy().shouldCountFailure.bind(
			new DefaultFailureDetectionStrategy()
		),
		shouldAllowRequest: new JitteredRecoveryStrategy(0.2).shouldAllowRequest.bind(
			new JitteredRecoveryStrategy(0.2)
		)
	} as Partial<CircuitBreakerConfig>
};

/**
 * Configuration builder for creating custom circuit breaker configs
 */
export class CircuitBreakerConfigBuilder {
	private config: Partial<CircuitBreakerConfig> = {};

	static create(): CircuitBreakerConfigBuilder {
		return new CircuitBreakerConfigBuilder();
	}

	withName(name: string): this {
		this.config.name = name;
		return this;
	}

	withFailureThreshold(threshold: number): this {
		this.config.failureThreshold = threshold;
		return this;
	}

	withFailureWindow(windowMs: number): this {
		this.config.failureWindow = windowMs;
		return this;
	}

	withRecoveryTimeout(timeoutMs: number): this {
		this.config.recoveryTimeout = timeoutMs;
		return this;
	}

	withSuccessThreshold(threshold: number): this {
		this.config.successThreshold = threshold;
		return this;
	}

	withFailureDetection(strategy: (error: Error) => boolean): this {
		this.config.shouldCountFailure = strategy;
		return this;
	}

	withRecoveryStrategy(strategy: (state: any) => boolean): this {
		this.config.shouldAllowRequest = strategy;
		return this;
	}

	withFallback(fallback: () => Promise<any>): this {
		this.config.fallback = fallback;
		return this;
	}

	build(): Partial<CircuitBreakerConfig> {
		return { ...this.config };
	}
}

/**
 * Utility functions for creating common configurations
 */
export const ConfigurationUtils = {
	/**
	 * Create a fast-recovery configuration
	 */
	fastRecovery: (name: string): Partial<CircuitBreakerConfig> => {
		return CircuitBreakerConfigBuilder.create()
			.withName(name)
			.withFailureThreshold(2)
			.withFailureWindow(15_000)
			.withRecoveryTimeout(3_000)
			.withSuccessThreshold(1)
			.build();
	},

	/**
	 * Create a conservative configuration
	 */
	conservative: (name: string): Partial<CircuitBreakerConfig> => {
		return CircuitBreakerConfigBuilder.create()
			.withName(name)
			.withFailureThreshold(5)
			.withFailureWindow(120_000)
			.withRecoveryTimeout(60_000)
			.withSuccessThreshold(5)
			.build();
	},

	/**
	 * Create a configuration for HTTP APIs
	 */
	httpApi: (name: string, statusCodes?: number[]): Partial<CircuitBreakerConfig> => {
		const httpStrategy = new HttpFailureDetectionStrategy(statusCodes);
		const jitteredRecovery = new JitteredRecoveryStrategy();

		return CircuitBreakerConfigBuilder.create()
			.withName(name)
			.withFailureThreshold(3)
			.withFailureWindow(30_000)
			.withRecoveryTimeout(10_000)
			.withSuccessThreshold(2)
			.withFailureDetection(httpStrategy.shouldCountFailure.bind(httpStrategy))
			.withRecoveryStrategy(jitteredRecovery.shouldAllowRequest.bind(jitteredRecovery))
			.build();
	},

	/**
	 * Create a configuration with exponential backoff
	 */
	exponentialBackoff: (name: string, maxBackoff = 300_000): Partial<CircuitBreakerConfig> => {
		const backoffStrategy = new ExponentialBackoffRecoveryStrategy(maxBackoff);

		return CircuitBreakerConfigBuilder.create()
			.withName(name)
			.withFailureThreshold(3)
			.withFailureWindow(60_000)
			.withRecoveryTimeout(10_000)
			.withSuccessThreshold(3)
			.withRecoveryStrategy(backoffStrategy.shouldAllowRequest.bind(backoffStrategy))
			.build();
	}
};
