/**
 * @fileoverview Authentication Service (Refactored)
 *
 * This module provides backward compatibility while delegating to the new
 * modular authentication structure in ./auth/. The new structure separates
 * concerns into focused services for better maintainability.
 *
 * @deprecated Use imports from '$lib/services/client/auth/' for new code
 * @author bim
 * @version 2.0.0
 */

// Re-export everything from the new modular structure
export * from './auth';
