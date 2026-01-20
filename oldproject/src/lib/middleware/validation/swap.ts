/**
 * @fileoverview Bitcoin and Swap Validation Schemas
 *
 * Validation schemas for Bitcoin and swap operations including
 * swap creation, status checking, and cross-chain operations.
 *
 * @author bim
 * @version 1.0.0
 */

import type { ValidationSchema } from './core';

/**
 * Bitcoin and swap validation schemas
 */
export const swapValidationSchemas = {
	// Bitcoin swap operations
	bitcoinSwap: {
		amount: { required: true, type: 'amount' as const, min: 1, max: 1000000 },
		address: {
			required: true,
			type: 'string' as const,
			maxLength: 100,
			sanitize: true
		},
		swapType: {
			required: true,
			type: 'string' as const,
			allowedValues: ['btc_to_lightning', 'lightning_to_btc']
		}
	} satisfies ValidationSchema,

	// Swap status checking
	swapStatus: {
		swapId: { required: true, type: 'swap_id' as const }
	} satisfies ValidationSchema
} as const;
