/**
 * @fileoverview Circuit Breaker State Transition Strategies (Legacy)
 *
 * @deprecated This file has been refactored. Use ./strategies.ts instead.
 * This file now re-exports from the compatibility layer for backward compatibility.
 */

export {
	DefaultStateTransitionStrategy,
	ConservativeStateTransitionStrategy,
	AggressiveStateTransitionStrategy,
	PercentageBasedStateTransitionStrategy
} from './legacy-strategies';
