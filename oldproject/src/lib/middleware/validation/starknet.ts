/**
 * @fileoverview Starknet Validation Schemas
 *
 * Validation schemas for Starknet operations including
 * account deployment, transaction processing, and address validation.
 *
 * @author bim
 * @version 1.0.0
 */

import type { ValidationSchema } from './core';

/**
 * Validates a Starknet address format
 * @param address The address to validate
 * @returns true if the address is valid, false otherwise
 */
export function validateStarknetAddress(address: string): boolean {
	if (!address || typeof address !== 'string') {
		return false;
	}

	// Remove 0x prefix if present
	const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;

	// Check if it's a valid hex string
	if (!/^[0-9a-fA-F]+$/.test(cleanAddress)) {
		return false;
	}

	// Starknet addresses should be at most 64 characters (32 bytes) when unpadded
	if (cleanAddress.length === 0 || cleanAddress.length > 64) {
		return false;
	}

	return true;
}

/**
 * Starknet validation schemas
 */
export const starknetValidationSchemas = {
	// Starknet account deployment
	starknetDeploy: {
		publicKey: {
			required: true,
			type: 'string' as const,
			maxLength: 200,
			sanitize: true
		},
		calldata: {
			required: false,
			type: 'string' as const,
			maxLength: 10000,
			sanitize: true
		}
	} satisfies ValidationSchema,

	// Starknet transaction processing
	starknetTransaction: {
		to: { required: true, type: 'starknet_address' as const },
		amount: { required: true, type: 'amount' as const, min: 1 },
		calldata: {
			required: false,
			type: 'string' as const,
			maxLength: 10000,
			sanitize: true
		}
	} satisfies ValidationSchema
} as const;
