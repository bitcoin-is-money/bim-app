/**
 * @fileoverview Circuit Breaker Pattern Implementation (Refactored)
 *
 * This module provides backward compatibility while delegating to the new
 * modular circuit breaker structure in ./circuit-breaker/. The new structure
 * separates concerns into pluggable strategies for better maintainability.
 *
 * @deprecated Use imports from '$lib/utils/network/circuit-breaker/' for new code
 * @author bim
 * @version 2.0.0
 */

// Re-export everything from the new modular structure
export * from './circuit-breaker';
