/**
 * @fileoverview Input Validation and Sanitization Middleware (Legacy)
 *
 * DEPRECATED: This file is maintained for backward compatibility.
 * New code should import from './validation/index.ts' or specific domain modules.
 *
 * The validation system has been refactored into domain-specific modules:
 * - Core validation: ./validation/core.ts
 * - Authentication: ./validation/auth.ts
 * - Lightning Network: ./validation/lightning.ts
 * - Bitcoin/Swap: ./validation/swap.ts
 * - Starknet: ./validation/starknet.ts
 *
 * @author bim
 * @version 2.0.0
 */

// Re-export everything from the new modular validation system for backward compatibility
export type {
	FieldConfig,
	ValidationError,
	ValidationResult,
	ValidationSchema
} from './validation';

export {
	createValidationMiddleware,
	validateField,
	validateRequestData,
	validationMiddleware,
	validationSchemas
} from './validation';
