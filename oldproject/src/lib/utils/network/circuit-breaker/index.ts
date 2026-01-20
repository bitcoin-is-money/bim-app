/**
 * @fileoverview Circuit Breaker Module - Main Export
 *
 * Centralized export for all circuit breaker components and utilities.
 * Provides backward compatibility with the original circuit-breaker.ts interface.
 */

// Export types and interfaces
export * from './types';

// Export strategy implementations
export * from './failure-strategies';
export * from './recovery-strategies';
export * from './state-strategies';

// Export configuration utilities
export * from './configurations';

// Export core circuit breaker implementation
export { CircuitBreaker } from './circuit-breaker';

// Export manager
export { CircuitBreakerManager } from './manager';

// Export utilities
export * from './utils';

// Re-export for backward compatibility
export { circuitBreakerManager, CircuitBreakerUtils } from './utils';
export { CIRCUIT_BREAKER_CONFIGS, DEFAULT_CIRCUIT_BREAKER_CONFIG } from './configurations';
