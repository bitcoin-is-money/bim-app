/**
 * @fileoverview API Response Type Definitions
 *
 * Type definitions for API responses, errors, and validation.
 */

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
	error: {
		code: string;
		message: string;
		details?: Record<string, any>;
		validation?: ValidationError[];
		timestamp: string;
		requestId?: string;
	};
	success: false;
}

/**
 * Standard API success response format
 */
export interface ApiSuccessResponse<T = any> {
	data: T;
	success: true;
	meta?: {
		timestamp: string;
		requestId?: string;
		pagination?: {
			page: number;
			limit: number;
			total: number;
			totalPages: number;
		};
	};
}

/**
 * Validation error for specific field
 */
export interface ValidationError {
	field: string;
	message: string;
	code: string;
	value?: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

/**
 * Request metadata for error tracking
 */
export interface RequestMetadata {
	endpoint: string;
	method?: string;
	url?: string;
	requestId: string;
	userAgent?: string;
	ip?: string;
}

/**
 * Validator function type
 */
export type ValidatorFunction = (value: any) => string | null;

/**
 * String validator function type (for query params)
 */
export type StringValidatorFunction = (value: string) => string | null;
