/**
 * @fileoverview Lightning Network Validation Schemas
 *
 * Validation schemas for Lightning Network operations including
 * invoice creation, payment processing, and network interactions.
 *
 * @author bim
 * @version 1.0.0
 */

import type { ValidationSchema } from './core';

/**
 * Lightning Network validation schemas
 */
export const lightningValidationSchemas = {
	// Lightning invoice creation
	lightningInvoice: {
		amount: { required: true, type: 'amount' as const, min: 1, max: 1000000 },
		description: {
			required: false,
			type: 'string' as const,
			maxLength: 640,
			sanitize: true
		}
	} satisfies ValidationSchema,

	// Lightning payment processing
	lightningPay: {
		invoice: { required: true, type: 'lightning_invoice' as const },
		amount: { required: false, type: 'amount' as const, min: 1 }
	} satisfies ValidationSchema
} as const;
