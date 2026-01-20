/**
 * @fileoverview Circuit Breaker Recovery Strategies (Legacy)
 *
 * @deprecated This file has been refactored. Use ./strategies.ts instead.
 * This file now re-exports from the compatibility layer for backward compatibility.
 */

export {
	DefaultRecoveryStrategy,
	ExponentialBackoffRecoveryStrategy,
	JitteredRecoveryStrategy,
	AdaptiveRecoveryStrategy,
	TimeBasedRecoveryStrategy
} from './legacy-strategies';
