/**
 * @fileoverview Validation Module Index
 *
 * Main entry point for the validation system. Exports all validation
 * schemas, middleware, and core functionality organized by domain.
 *
 * @author bim
 * @version 1.0.0
 */

// Core validation functionality
export type { FieldConfig, ValidationError, ValidationResult, ValidationSchema } from './core';

export { validateField, validateRequestData } from './core';

// Domain-specific validation schemas
export { authValidationSchemas } from './auth';
export { lightningValidationSchemas } from './lightning';
export { starknetValidationSchemas } from './starknet';
export { swapValidationSchemas } from './swap';

// Combined middleware and schemas
export { createValidationMiddleware, validationMiddleware, validationSchemas } from './middleware';

// Re-export everything for backward compatibility
export {
	validationMiddleware as validationMiddleware_legacy,
	validationSchemas as validationSchemas_legacy
} from './middleware';
