export interface ValidationRule<T = any> {
	test: (value: T) => boolean;
	message: string;
}

export interface ValidationResult {
	isValid: boolean;
	errors: string[];
}

export function validateField<T>(value: T, rules: ValidationRule<T>[]): ValidationResult {
	const errors: string[] = [];

	for (const rule of rules) {
		if (!rule.test(value)) {
			errors.push(rule.message);
		}
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}

export function validateForm<T extends Record<string, any>>(
	formData: T,
	fieldRules: Record<keyof T, ValidationRule<T[keyof T]>[]>
): Record<keyof T, ValidationResult> & { isFormValid: boolean } {
	const results = {} as Record<keyof T, ValidationResult>;
	let isFormValid = true;

	for (const field in fieldRules) {
		const fieldResult = validateField(formData[field], fieldRules[field]);
		results[field] = fieldResult;

		if (!fieldResult.isValid) {
			isFormValid = false;
		}
	}

	return {
		...results,
		isFormValid
	};
}

// Common validation rules
export const commonRules = {
	required: <T>(message = 'This field is required'): ValidationRule<T> => ({
		test: (value) => value !== null && value !== undefined && value !== '',
		message
	}),

	minLength: (min: number, message?: string): ValidationRule<string> => ({
		test: (value) => typeof value === 'string' && value.length >= min,
		message: message || `Must be at least ${min} characters`
	}),

	maxLength: (max: number, message?: string): ValidationRule<string> => ({
		test: (value) => typeof value === 'string' && value.length <= max,
		message: message || `Must be no more than ${max} characters`
	}),

	email: (message = 'Must be a valid email address'): ValidationRule<string> => ({
		test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
		message
	}),

	starknetAddress: (message = 'Must be a valid Starknet address'): ValidationRule<string> => ({
		test: (value) => /^0x[a-fA-F0-9]{63,64}$/.test(value),
		message
	}),

	lightningAddress: (
		message = 'Must be a valid Lightning address or invoice'
	): ValidationRule<string> => ({
		test: (value) => {
			// Lightning address format (user@domain.com)
			const lightningAddressPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
			// Lightning invoice format (starts with lnbc, lntb, etc.)
			const lightningInvoicePattern = /^ln[a-z0-9]+$/i;

			return lightningAddressPattern.test(value) || lightningInvoicePattern.test(value);
		},
		message
	})
};

// Client-side validation rules that use translations
// These should only be used in Svelte components where $t is available
export const createTranslatedRules = (t: (key: string, params?: any) => string) => ({
	required: <T>(): ValidationRule<T> => ({
		test: (value) => value !== null && value !== undefined && value !== '',
		message: t('validation.fieldRequired')
	}),

	minLength: (min: number): ValidationRule<string> => ({
		test: (value) => typeof value === 'string' && value.length >= min,
		message: t('validation.minLength', { min })
	}),

	maxLength: (max: number): ValidationRule<string> => ({
		test: (value) => typeof value === 'string' && value.length <= max,
		message: t('validation.maxLength', { max })
	}),

	email: (): ValidationRule<string> => ({
		test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
		message: t('validation.validEmail')
	}),

	starknetAddress: (): ValidationRule<string> => ({
		test: (value) => /^0x[a-fA-F0-9]{63,64}$/.test(value),
		message: t('validation.validStarknetAddress')
	}),

	lightningAddress: (): ValidationRule<string> => ({
		test: (value) => {
			// Lightning address format (user@domain.com)
			const lightningAddressPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
			// Lightning invoice format (starts with lnbc, lntb, etc.)
			const lightningInvoicePattern = /^ln[a-z0-9]+$/i;

			return lightningAddressPattern.test(value) || lightningInvoicePattern.test(value);
		},
		message: t('validation.validLightningAddress')
	})
});
