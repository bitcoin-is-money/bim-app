/**
 * @fileoverview Circuit Breaker Failure Detection Strategies (Legacy)
 *
 * @deprecated This file has been refactored. Use ./strategies.ts instead.
 * This file now re-exports from the compatibility layer for backward compatibility.
 */

export {
	DefaultFailureDetectionStrategy,
	StrictFailureDetectionStrategy,
	LenientFailureDetectionStrategy,
	HttpFailureDetectionStrategy,
	CustomFailureDetectionStrategy
} from './legacy-strategies';
