/**
 * @fileoverview API Request Validation Utilities
 *
 * Utilities for validating request bodies and query parameters.
 */

import type {
	ValidatorFunction,
	StringValidatorFunction,
	ValidationError,
	ValidationResult
} from './types';

/**
 * Validate request body and return standardized validation errors
 */
export function validateRequestBody(
	body: any,
	requiredFields: string[],
	validators?: Record<string, ValidatorFunction>
): ValidationError[] {
	const errors: ValidationError[] = [];

	// Check required fields
	for (const field of requiredFields) {
		if (body[field] === undefined || body[field] === null || body[field] === '') {
			errors.push({
				field,
				message: `${field} is required`,
				code: 'REQUIRED',
				value: body[field]
			});
		}
	}

	// Run custom validators
	if (validators) {
		for (const [field, validator] of Object.entries(validators)) {
			if (body[field] !== undefined) {
				const error = validator(body[field]);
				if (error) {
					errors.push({
						field,
						message: error,
						code: 'INVALID',
						value: body[field]
					});
				}
			}
		}
	}

	return errors;
}

/**
 * Validate query parameters and return standardized validation errors
 */
export function validateQueryParams(
	searchParams: URLSearchParams,
	requiredParams: string[],
	validators?: Record<string, StringValidatorFunction>
): ValidationError[] {
	const errors: ValidationError[] = [];

	// Check required parameters
	for (const param of requiredParams) {
		const value = searchParams.get(param);
		if (!value) {
			errors.push({
				field: param,
				message: `${param} parameter is required`,
				code: 'REQUIRED',
				value
			});
		}
	}

	// Run custom validators
	if (validators) {
		for (const [param, validator] of Object.entries(validators)) {
			const value = searchParams.get(param);
			if (value !== null) {
				const error = validator(value);
				if (error) {
					errors.push({
						field: param,
						message: error,
						code: 'INVALID',
						value
					});
				}
			}
		}
	}

	return errors;
}

/**
 * Validate object and return validation result
 */
export function validateObject(
	obj: any,
	requiredFields: string[],
	validators?: Record<string, ValidatorFunction>
): ValidationResult {
	const errors = validateRequestBody(obj, requiredFields, validators);
	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Common validators
 */
export const validators = {
	positiveNumber: (value: any): string | null => {
		const num = Number(value);
		if (isNaN(num) || num <= 0) {
			return 'Must be a positive number';
		}
		return null;
	},

	nonNegativeNumber: (value: any): string | null => {
		const num = Number(value);
		if (isNaN(num) || num < 0) {
			return 'Must be a non-negative number';
		}
		return null;
	},

	integer: (value: any): string | null => {
		const num = Number(value);
		if (isNaN(num) || !Number.isInteger(num)) {
			return 'Must be an integer';
		}
		return null;
	},

	starknetAddress: (value: any): string | null => {
		if (typeof value !== 'string' || !value.startsWith('0x') || value.length !== 66) {
			return 'Must be a valid Starknet address (0x followed by 64 hex characters)';
		}
		return null;
	},

	bitcoinAddress: (value: any): string | null => {
		if (typeof value !== 'string' || value.length < 26 || value.length > 62) {
			return 'Must be a valid Bitcoin address';
		}
		// Basic format check - starts with 1, 3, or bc1
		if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(value)) {
			return 'Must be a valid Bitcoin address';
		}
		return null;
	},

	supportedAsset: (value: any): string | null => {
		// Note: This validator is synchronous but we need async access to supported assets
		// For now, we'll use a basic check and let the actual validation happen in the service layer
		if (!value || typeof value !== 'string') {
			return 'Asset must be a non-empty string';
		}
		// The actual supported asset validation should be done in the service layer
		// where we can access the Atomiq SDK
		return null;
	},

	email: (value: any): string | null => {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (typeof value !== 'string' || !emailRegex.test(value)) {
			return 'Must be a valid email address';
		}
		return null;
	},

	url: (value: any): string | null => {
		if (typeof value !== 'string') {
			return 'Must be a string';
		}
		try {
			new URL(value);
			return null;
		} catch {
			return 'Must be a valid URL';
		}
	},

	uuid: (value: any): string | null => {
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (typeof value !== 'string' || !uuidRegex.test(value)) {
			return 'Must be a valid UUID';
		}
		return null;
	},

	hexString: (value: any): string | null => {
		if (typeof value !== 'string' || !/^0x[a-fA-F0-9]+$/.test(value)) {
			return 'Must be a valid hex string (starting with 0x)';
		}
		return null;
	},

	base64: (value: any): string | null => {
		if (typeof value !== 'string') {
			return 'Must be a string';
		}
		try {
			btoa(atob(value));
			return null;
		} catch {
			return 'Must be valid base64';
		}
	},

	minLength:
		(minLength: number): ValidatorFunction =>
		(value: any): string | null => {
			if (typeof value !== 'string' || value.length < minLength) {
				return `Must be at least ${minLength} characters long`;
			}
			return null;
		},

	maxLength:
		(maxLength: number): ValidatorFunction =>
		(value: any): string | null => {
			if (typeof value !== 'string' || value.length > maxLength) {
				return `Must be no more than ${maxLength} characters long`;
			}
			return null;
		},

	range:
		(min: number, max: number): ValidatorFunction =>
		(value: any): string | null => {
			const num = Number(value);
			if (isNaN(num) || num < min || num > max) {
				return `Must be between ${min} and ${max}`;
			}
			return null;
		},

	oneOf:
		(allowedValues: any[]): ValidatorFunction =>
		(value: any): string | null => {
			if (!allowedValues.includes(value)) {
				return `Must be one of: ${allowedValues.join(', ')}`;
			}
			return null;
		},

	array:
		(itemValidator?: ValidatorFunction): ValidatorFunction =>
		(value: any): string | null => {
			if (!Array.isArray(value)) {
				return 'Must be an array';
			}

			if (itemValidator) {
				for (let i = 0; i < value.length; i++) {
					const error = itemValidator(value[i]);
					if (error) {
						return `Item at index ${i}: ${error}`;
					}
				}
			}

			return null;
		},

	object:
		(shape?: Record<string, ValidatorFunction>): ValidatorFunction =>
		(value: any): string | null => {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				return 'Must be an object';
			}

			if (shape) {
				for (const [key, validator] of Object.entries(shape)) {
					const error = validator(value[key]);
					if (error) {
						return `Property '${key}': ${error}`;
					}
				}
			}

			return null;
		}
};
