/**
 * @fileoverview Lightning Network Error Types (Refactored)
 *
 * This module provides backward compatibility while delegating to the new
 * modular error structure in ./lightning/. The new structure separates
 * error types into focused modules for better maintainability.
 *
 * @deprecated Use imports from '$lib/errors/lightning/' for new code
 * @author bim
 * @version 2.0.0
 */

// Re-export everything from the new modular structure
export * from './lightning/index';
