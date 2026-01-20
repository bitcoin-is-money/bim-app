/**
 * Server-side translation utilities
 *
 * This module provides translation functions for server-side code
 * that can't use the client-side svelte-i18n library.
 */

import type { AppLocale } from './index';

// Simple translation function for server-side use
// This is a basic implementation that can be enhanced later
export function t(key: string, _locale: AppLocale = 'en', params?: Record<string, any>): string {
	// For now, return the key as fallback
	// In a full implementation, this would load the appropriate translation file
	// and perform parameter substitution

	// Basic parameter substitution
	if (params) {
		let result = key;
		for (const [paramKey, paramValue] of Object.entries(params)) {
			result = result.replace(new RegExp(`\\$\\{${paramKey}\\}`, 'g'), String(paramValue));
		}
		return result;
	}

	return key;
}

// Error message translations for common server-side errors
export const serverErrorMessages = {
	en: {
		authentication_required: 'Authentication required',
		method_not_allowed: 'Method not allowed',
		parse_request_failed: 'Failed to parse request data',
		invalid_request_format: 'Invalid request format',
		validation_failed: 'Validation failed',
		unexpected_fields: 'Unexpected fields in request'
	},
	fr: {
		authentication_required: 'Authentification requise',
		method_not_allowed: 'Méthode non autorisée',
		parse_request_failed: "Échec de l'analyse des données de demande",
		invalid_request_format: 'Format de demande invalide',
		validation_failed: 'Échec de la validation',
		unexpected_fields: 'Champs inattendus dans la demande'
	}
};

export function getServerErrorMessage(key: string, locale: AppLocale = 'en'): string {
	const localeMessages = serverErrorMessages[locale] as Record<string, string>;
	const englishMessages = serverErrorMessages.en as Record<string, string>;
	return localeMessages?.[key] || englishMessages[key] || key;
}
