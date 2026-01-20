/**
 * @fileoverview Validation Middleware Factory
 *
 * Creates validation middleware instances for different validation schemas
 * and provides unified access to all domain-specific validations.
 *
 * @author bim
 * @version 1.0.0
 */

import { getServerErrorMessage } from '$lib/i18n/server';
import { logSecurityEvent } from '$lib/utils/security';
import { error, type RequestEvent } from '@sveltejs/kit';
import { authValidationSchemas } from './auth';
import { validateRequestData } from './core';
import { lightningValidationSchemas } from './lightning';
import { starknetValidationSchemas } from './starknet';
import { swapValidationSchemas } from './swap';

/**
 * Combined validation schemas from all domains
 */
export const validationSchemas = {
	...authValidationSchemas,
	...lightningValidationSchemas,
	...swapValidationSchemas,
	...starknetValidationSchemas
} as const;

/**
 * Create validation middleware for specific schema
 */
export function createValidationMiddleware(schemaName: keyof typeof validationSchemas) {
	return async (event: RequestEvent) => {
		let requestData: any = {};

		try {
			// Extract data based on request method
			if (event.request.method === 'POST' || event.request.method === 'PUT') {
				const contentType = event.request.headers.get('content-type');

				if (contentType?.includes('application/json')) {
					requestData = await event.request.json();
				} else if (contentType?.includes('application/x-www-form-urlencoded')) {
					const formData = await event.request.formData();
					requestData = Object.fromEntries(formData.entries());
				}
			} else if (event.request.method === 'GET' || event.request.method === 'DELETE') {
				// Extract from URL parameters
				requestData = Object.fromEntries(event.url.searchParams.entries());
			}
		} catch (parseError) {
			logSecurityEvent(
				'invalid_input_detected',
				{
					reason: getServerErrorMessage('parse_request_failed'),
					contentType: event.request.headers.get('content-type'),
					error: parseError
				},
				'medium'
			);

			throw error(400, getServerErrorMessage('invalid_request_format'));
		}

		// Validate against schema
		const schema = validationSchemas[schemaName];
		const result = validateRequestData(requestData, schema);

		if (!result.valid) {
			logSecurityEvent(
				'invalid_input_detected',
				{
					reason: getServerErrorMessage('validation_failed'),
					schema: schemaName,
					errors: result.errors,
					requestData: JSON.stringify(requestData)
				},
				'medium'
			);

			throw error(400, getServerErrorMessage('validation_failed'));
		}

		// Store sanitized data in event.locals for use by route handlers
		(event.locals as any).validatedData = result.sanitizedData;

		return result;
	};
}

/**
 * Pre-configured validation middleware for common endpoints
 */
export const validationMiddleware = {
	// Authentication
	login: createValidationMiddleware('login'),
	register: createValidationMiddleware('register'),
	webauthnRegister: createValidationMiddleware('webauthnRegister'),
	userProfile: createValidationMiddleware('userProfile'),

	// Lightning Network
	lightningInvoice: createValidationMiddleware('lightningInvoice'),
	lightningPay: createValidationMiddleware('lightningPay'),

	// Bitcoin/Swap operations
	bitcoinSwap: createValidationMiddleware('bitcoinSwap'),
	swapStatus: createValidationMiddleware('swapStatus'),

	// Starknet operations
	starknetDeploy: createValidationMiddleware('starknetDeploy'),
	starknetTransaction: createValidationMiddleware('starknetTransaction')
};
