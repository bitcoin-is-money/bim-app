/**
 * @fileoverview API Response Utilities (Refactored)
 *
 * This module provides backward compatibility while delegating to the new
 * modular API response structure in ./api-response/. The new structure
 * separates concerns into focused modules for better maintainability.
 *
 * @deprecated Use imports from '$lib/services/shared/api-response/' for new code
 * @author bim
 * @version 2.0.0
 */

// Re-export everything from the new modular structure
export * from './api-response';
