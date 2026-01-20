/**
 * @fileoverview Authentication Validation Schemas
 *
 * Validation schemas and middleware for authentication-related operations
 * including login, registration, and WebAuthn operations.
 *
 * @author bim
 * @version 1.0.0
 */

import type { ValidationSchema } from './core';

/**
 * Authentication validation schemas
 */
export const authValidationSchemas = {
	// User login validation
	login: {
		email: { required: true, type: 'email' as const, sanitize: true },
		password: {
			required: true,
			type: 'string' as const,
			minLength: 8,
			maxLength: 128
		}
	} satisfies ValidationSchema,

	// User registration validation
	register: {
		email: { required: true, type: 'email' as const, sanitize: true },
		username: { required: true, type: 'username' as const, sanitize: true },
		password: {
			required: true,
			type: 'string' as const,
			minLength: 8,
			maxLength: 128
		}
	} satisfies ValidationSchema,

	// WebAuthn registration validation
	webauthnRegister: {
		username: { required: true, type: 'username' as const, sanitize: true },
		displayName: {
			required: false,
			type: 'string' as const,
			maxLength: 64,
			sanitize: true
		}
	} satisfies ValidationSchema,

	// User profile validation
	userProfile: {
		displayName: {
			required: false,
			type: 'string' as const,
			maxLength: 64,
			sanitize: true
		},
		email: { required: false, type: 'email' as const, sanitize: true }
	} satisfies ValidationSchema
} as const;
