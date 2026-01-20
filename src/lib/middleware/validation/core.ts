/**
 * @fileoverview Core Field Validation and Sanitization
 *
 * Provides base validation functions and types that are used across
 * all domain-specific validation modules.
 *
 * @author bim
 * @version 1.0.0
 */

import { getServerErrorMessage } from '$lib/i18n/server';
import { logSecurityEvent, sanitize, validate } from '$lib/utils/security';

/**
 * Validation error details
 */
export interface ValidationError {
	field: string;
	message: string;
	value?: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	sanitizedData?: any;
}

/**
 * Field validation configuration
 */
export interface FieldConfig {
	required?: boolean;
	type:
		| 'string'
		| 'number'
		| 'email'
		| 'username'
		| 'starknet_address'
		| 'lightning_invoice'
		| 'amount'
		| 'swap_id'
		| 'url';
	minLength?: number;
	maxLength?: number;
	min?: number;
	max?: number;
	pattern?: RegExp;
	sanitize?: boolean;
	allowedValues?: any[];
}

/**
 * Validation schema for different endpoint types
 */
export interface ValidationSchema {
	[fieldName: string]: FieldConfig;
}

/**
 * Validate and sanitize a single field
 */
export function validateField(
	value: any,
	fieldName: string,
	config: FieldConfig
): { valid: boolean; sanitizedValue?: any; error?: ValidationError } {
	// Check required fields
	if (config.required && (value === undefined || value === null || value === '')) {
		return {
			valid: false,
			error: {
				field: fieldName,
				message: `${fieldName} is required`
			}
		};
	}

	// Skip validation for optional empty fields
	if (!config.required && (value === undefined || value === null || value === '')) {
		return { valid: true, sanitizedValue: value };
	}

	let sanitizedValue = value;

	try {
		// Type-specific validation and sanitization
		switch (config.type) {
			case 'string':
				if (typeof value !== 'string') {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a string`,
							value
						}
					};
				}
				if (config.sanitize) {
					sanitizedValue = sanitize.html(value);
				}
				if (config.minLength && sanitizedValue.length < config.minLength) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be at least ${config.minLength} characters`
						}
					};
				}
				if (config.maxLength && sanitizedValue.length > config.maxLength) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be no more than ${config.maxLength} characters`
						}
					};
				}
				break;

			case 'number':
				const num = typeof value === 'string' ? parseFloat(value) : value;
				if (isNaN(num) || !isFinite(num)) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a valid number`,
							value
						}
					};
				}
				sanitizedValue = num;
				if (config.min !== undefined && num < config.min) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be at least ${config.min}`
						}
					};
				}
				if (config.max !== undefined && num > config.max) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be no more than ${config.max}`
						}
					};
				}
				break;

			case 'email':
				if (typeof value !== 'string' || !validate.email(value)) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a valid email address`,
							value
						}
					};
				}
				sanitizedValue = sanitize.html(value.toLowerCase().trim());
				break;

			case 'username':
				if (typeof value !== 'string' || !validate.username(value)) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be 3-20 characters, alphanumeric and underscores only`,
							value
						}
					};
				}
				sanitizedValue = sanitize.html(value.trim());
				break;

			case 'starknet_address':
				if (typeof value !== 'string') {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a string`,
							value
						}
					};
				}
				try {
					sanitizedValue = sanitize.starknetAddress(value);
				} catch (e) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a valid Starknet address`,
							value
						}
					};
				}
				break;

			case 'lightning_invoice':
				if (typeof value !== 'string') {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a string`,
							value
						}
					};
				}
				try {
					sanitizedValue = sanitize.lightningInvoice(value);
				} catch (e) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a valid Lightning invoice or address`,
							value
						}
					};
				}
				break;

			case 'amount':
				const amount = typeof value === 'string' ? parseFloat(value) : value;
				if (!validate.amount(amount, config.min, config.max)) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a valid amount`,
							value
						}
					};
				}
				sanitizedValue = amount;
				break;

			case 'swap_id':
				if (typeof value !== 'string' || !validate.swapId(value)) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a valid swap ID`,
							value
						}
					};
				}
				sanitizedValue = sanitize.html(value.trim());
				break;

			case 'url':
				if (typeof value !== 'string') {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a string`,
							value
						}
					};
				}
				try {
					sanitizedValue = sanitize.url(value);
					if (!sanitizedValue) {
						throw new Error('Invalid URL');
					}
				} catch (e) {
					return {
						valid: false,
						error: {
							field: fieldName,
							message: `${fieldName} must be a valid URL`,
							value
						}
					};
				}
				break;
		}

		// Pattern validation
		if (config.pattern && !config.pattern.test(String(sanitizedValue))) {
			return {
				valid: false,
				error: {
					field: fieldName,
					message: `${fieldName} format is invalid`,
					value
				}
			};
		}

		// Allowed values validation
		if (config.allowedValues && !config.allowedValues.includes(sanitizedValue)) {
			return {
				valid: false,
				error: {
					field: fieldName,
					message: `${fieldName} must be one of: ${config.allowedValues.join(', ')}`,
					value
				}
			};
		}

		return { valid: true, sanitizedValue };
	} catch (error) {
		return {
			valid: false,
			error: {
				field: fieldName,
				message: `${fieldName} validation failed: ${error}`,
				value
			}
		};
	}
}

/**
 * Validate request data against schema
 */
export function validateRequestData(data: any, schema: ValidationSchema): ValidationResult {
	const errors: ValidationError[] = [];
	const sanitizedData: any = {};

	// Validate each field in the schema
	for (const [fieldName, config] of Object.entries(schema)) {
		const value = data[fieldName];
		const result = validateField(value, fieldName, config);

		if (!result.valid && result.error) {
			errors.push(result.error);
		} else if (result.valid) {
			sanitizedData[fieldName] = result.sanitizedValue;
		}
	}

	// Check for unexpected fields (potential injection attempt)
	const allowedFields = Object.keys(schema);
	const providedFields = Object.keys(data || {});
	const unexpectedFields = providedFields.filter((field) => !allowedFields.includes(field));

	if (unexpectedFields.length > 0) {
		logSecurityEvent(
			'suspicious_activity',
			{
				reason: getServerErrorMessage('unexpected_fields'),
				unexpectedFields,
				allowedFields
			},
			'medium'
		);

		// Add warnings for unexpected fields but don't fail validation
		// In production, you might want to be stricter
	}

	return {
		valid: errors.length === 0,
		errors,
		sanitizedData: errors.length === 0 ? sanitizedData : undefined
	};
}
