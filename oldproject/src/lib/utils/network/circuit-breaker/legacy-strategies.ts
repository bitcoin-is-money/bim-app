/**
 * @fileoverview Legacy Strategy Compatibility Layer
 *
 * Provides backward compatibility for the old micro-strategy classes.
 * These are implemented as thin wrappers around the new configurable strategies.
 *
 * @deprecated Use the new configurable strategies instead.
 */

import {
	ConfigurableFailureDetectionStrategy,
	ConfigurableRecoveryStrategy,
	ConfigurableStateTransitionStrategy,
	FailureDetectionMode,
	RecoveryMode,
	StateTransitionMode
} from './strategies';
import { CircuitBreakerState, CircuitBreakerConfig } from './types';

// ===== RECOVERY STRATEGIES =====

export class DefaultRecoveryStrategy extends ConfigurableRecoveryStrategy {
	constructor() {
		super({ mode: RecoveryMode.DEFAULT });
	}
}

export class ExponentialBackoffRecoveryStrategy extends ConfigurableRecoveryStrategy {
	constructor(maxBackoffTime = 300000, backoffMultiplier = 2) {
		super({
			mode: RecoveryMode.EXPONENTIAL_BACKOFF,
			maxBackoffTime,
			backoffMultiplier
		});
	}
}

export class JitteredRecoveryStrategy extends ConfigurableRecoveryStrategy {
	constructor(jitterFactor = 0.1) {
		super({
			mode: RecoveryMode.JITTERED,
			jitterFactor
		});
	}
}

export class AdaptiveRecoveryStrategy extends ConfigurableRecoveryStrategy {
	constructor(adaptationFactor = 0.5) {
		super({
			mode: RecoveryMode.ADAPTIVE,
			adaptationFactor
		});
	}
}

export class TimeBasedRecoveryStrategy extends ConfigurableRecoveryStrategy {
	constructor(timeSlots?: Map<string, number>) {
		super({
			mode: RecoveryMode.TIME_BASED,
			timeSlots
		});
	}
}

// ===== STATE TRANSITION STRATEGIES =====

export class DefaultStateTransitionStrategy extends ConfigurableStateTransitionStrategy {
	constructor() {
		super({ mode: StateTransitionMode.DEFAULT });
	}
}

export class ConservativeStateTransitionStrategy extends ConfigurableStateTransitionStrategy {
	constructor(conservativeMultiplier = 2) {
		super({
			mode: StateTransitionMode.CONSERVATIVE,
			multiplier: conservativeMultiplier
		});
	}
}

export class AggressiveStateTransitionStrategy extends ConfigurableStateTransitionStrategy {
	constructor(aggressiveMultiplier = 0.5) {
		super({
			mode: StateTransitionMode.AGGRESSIVE,
			multiplier: aggressiveMultiplier
		});
	}
}

export class PercentageBasedStateTransitionStrategy extends ConfigurableStateTransitionStrategy {
	constructor(failurePercentageThreshold = 0.5, minimumRequests = 10) {
		super({
			mode: StateTransitionMode.PERCENTAGE_BASED,
			failurePercentageThreshold,
			minimumRequests
		});
	}
}

// ===== FAILURE DETECTION STRATEGIES =====

export class DefaultFailureDetectionStrategy extends ConfigurableFailureDetectionStrategy {
	constructor() {
		super({ mode: FailureDetectionMode.DEFAULT });
	}
}

export class StrictFailureDetectionStrategy extends ConfigurableFailureDetectionStrategy {
	constructor() {
		super({ mode: FailureDetectionMode.STRICT });
	}
}

export class LenientFailureDetectionStrategy extends ConfigurableFailureDetectionStrategy {
	constructor() {
		super({ mode: FailureDetectionMode.LENIENT });
	}
}

export class HttpFailureDetectionStrategy extends ConfigurableFailureDetectionStrategy {
	constructor(failureStatusCodes: number[] = [500, 502, 503, 504]) {
		super({
			mode: FailureDetectionMode.HTTP_FOCUSED,
			failureStatusCodes
		});
	}
}

export class CustomFailureDetectionStrategy extends ConfigurableFailureDetectionStrategy {
	constructor(predicate: (error: Error) => boolean) {
		super({
			mode: FailureDetectionMode.CUSTOM,
			customPredicate: predicate
		});
	}
}
