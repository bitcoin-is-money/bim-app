import { browser } from '$app/environment';
import { initializeI18n } from '$lib/i18n';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => {
	// Initialize svelte-i18n with server-provided locale
	// Ensure this happens immediately and synchronously in browser
	if (browser) {
		// Force immediate initialization in browser to prevent hydration errors
		try {
			await initializeI18n(data?.locale);
		} catch (error) {
			console.warn('Failed to initialize i18n in layout:', error);
		}
	}

	return {
		...data,
		// Ensure locale is always available
		locale: data?.locale || 'en'
	};
};
