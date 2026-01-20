/**
 * @fileoverview Root Layout Load Function - SSR User Authentication
 *
 * This module provides server-side user loading for the root layout,
 * ensuring that user authentication state is available during SSR
 * and preventing hydration mismatches between server and client.
 *
 * Key Features:
 * - Server-side user session validation
 * - Consistent authentication state between SSR and client
 * - Performance optimization with proper caching
 * - Server-side i18n initialization to prevent rendering errors
 *
 * The load function runs on the server before the page renders,
 * ensuring that user data is available immediately when the page
 * loads, preventing the flash of unauthenticated content.
 *
 * @requires $lib/auth/session - Server-side session management
 * @requires $lib/db - Database types and utilities
 * @requires $lib/i18n - Internationalization system
 *
 * @author bim
 * @version 1.0.0
 */

import { getCurrentUser } from '$lib/auth/session';
import { normalizeLocale, initializeI18nForSSR } from '$lib/i18n';
import type { User } from '$lib/db';
import type { LayoutServerLoad } from './$types';

function parseAcceptLanguage(header: string | null | undefined): string | undefined {
	if (!header) return undefined;
	// Very simple parser: take first tag like en-US or fr
	const token = header.split(',')[0]?.trim();
	return token || undefined;
}

/**
 * Layout load function for SSR user authentication
 *
 * This function runs on the server for every page request and loads
 * the current user's authentication state. It ensures that:
 *
 * 1. User authentication is validated server-side
 * 2. User data is available during SSR
 * 3. No hydration mismatches occur
 * 4. Authentication state is consistent across server and client
 * 5. i18n system is properly initialized for server-side rendering
 *
 * The function checks for valid session cookies and validates them
 * against the database, returning the user data for use in the layout
 * and all child pages.
 *
 * @param event - SvelteKit load event containing request and URL info
 * @param event.cookies - Cookie store for session management
 * @param event.url - Current page URL for routing context
 * @param event.params - URL parameters if any
 *
 * @returns Promise resolving to layout data including user and loading state
 *
 * @example
 * ```typescript
 * // In a page component
 * export let data;
 * const { user } = data; // User is available from SSR
 * ```
 */
export const load: LayoutServerLoad = async ({ request, url, cookies, locals }) => {
	try {
		// Create a proper RequestEvent-like object for session validation
		const event = {
			request,
			cookies
		} as any;

		// Get current user session from server-side validation
		const user: User | null = await getCurrentUser(event);

		// Resolve locale from cookie or Accept-Language, then normalize to supported
		const cookieLocale = cookies.get('lang');
		const headerLocale = parseAcceptLanguage(request.headers.get('accept-language'));
		const pickedRaw = (
			(locals as any)?.locale ||
			cookieLocale ||
			headerLocale ||
			'en'
		).toLowerCase();

		// Debug logging
		console.log(`[SERVER DEBUG] Cookie locale: ${cookieLocale}`);
		console.log(`[SERVER DEBUG] Header locale: ${headerLocale}`);
		console.log(`[SERVER DEBUG] Picked raw locale: ${pickedRaw}`);

		// Normalize to supported locales (e.g., fr-FR -> fr)
		const validLocale = normalizeLocale(pickedRaw) || 'en';

		console.log(`[SERVER DEBUG] Valid locale: ${validLocale}`);

		// Persist cookie for future requests (1 year)
		if (cookieLocale !== validLocale) {
			cookies.set('lang', validLocale, {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				sameSite: 'lax'
			});
			console.log(`[SERVER DEBUG] Cookie updated to: ${validLocale}`);
		}

		// Initialize i18n on the server side to prevent rendering errors
		try {
			await initializeI18nForSSR(validLocale);
			console.log(`[SERVER DEBUG] i18n initialized with locale: ${validLocale}`);
		} catch (i18nError) {
			console.error('[SERVER DEBUG] Failed to initialize i18n:', i18nError);
			// Continue without i18n - fallback to default locale
		}

		// Return user data and loading state for the layout
		return {
			user,
			loading: false,
			url: url.pathname,
			locale: validLocale
		};
	} catch (error) {
		// Log error for monitoring while providing graceful fallback
		console.error('Layout load error:', error);

		// Return safe fallback state - no user, not loading
		return {
			user: null,
			loading: false,
			url: url.pathname,
			error: 'Failed to load user session',
			locale: 'en'
		};
	}
};
