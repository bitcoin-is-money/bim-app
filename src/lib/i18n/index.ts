import {
	locale as $locale,
	getLocaleFromNavigator,
	init,
	register,
	addMessages
} from 'svelte-i18n';
import { browser } from '$app/environment';

// Supported locales in the app
export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

// Track initialization state
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Lazy-load locale dictionaries
// Helper to load and merge multiple JSON modules for a locale
async function loadLocaleBundle(locale: AppLocale) {
	const loaders: Promise<any>[] = [];
	if (locale === 'en') {
		loaders.push(import('./locales/en/common.json'));
		loaders.push(import('./locales/en/pay.json'));
		loaders.push(import('./locales/en/receive.json'));
		loaders.push(import('./locales/en/dashboard.json'));
		loaders.push(import('./locales/en/errors.json'));
		loaders.push(import('./locales/en/debug.json'));
	} else if (locale === 'fr') {
		try {
			loaders.push(import('./locales/fr/common.json'));
		} catch {}
		try {
			loaders.push(import('./locales/fr/pay.json'));
		} catch {}
		try {
			loaders.push(import('./locales/fr/receive.json'));
		} catch {}
		try {
			loaders.push(import('./locales/fr/dashboard.json'));
		} catch {}
		try {
			loaders.push(import('./locales/fr/errors.json'));
		} catch {}
		try {
			loaders.push(import('./locales/fr/debug.json'));
		} catch {}
	}

	const parts = await Promise.all(loaders);

	// Deep merge objects to handle nested structures properly
	const deepMerge = (target: any, source: any): any => {
		if (source && typeof source === 'object' && !Array.isArray(source)) {
			if (!target || typeof target !== 'object' || Array.isArray(target)) {
				target = {};
			}
			for (const key in source) {
				if (source.hasOwnProperty(key)) {
					target[key] = deepMerge(target[key], source[key]);
				}
			}
		} else {
			target = source;
		}
		return target;
	};

	// Merge objects deeply instead of shallow merge
	const merged = parts.reduce((acc, mod) => {
		const content = mod?.default || mod;
		return deepMerge(acc, content);
	}, {} as any);

	return merged;
}

register('en', async () => loadLocaleBundle('en'));
register('fr', async () => {
	try {
		return await loadLocaleBundle('fr');
	} catch {
		return await loadLocaleBundle('en');
	}
});

// Helpers to persist locale choice
function setLangCookie(lang: string) {
	if (!browser) return;
	try {
		const maxAge = 60 * 60 * 24 * 365; // 1 year
		document.cookie = `lang=${lang}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
	} catch (e) {
		console.warn('[i18n] Failed to set lang cookie', e);
	}
}

function setLangLocal(lang: string) {
	if (!browser) return;
	try {
		localStorage.setItem('lang', lang);
	} catch (e) {
		// Ignore storage failures (private mode, etc.)
	}
}

function getLangLocal(): string | undefined {
	if (!browser) return undefined;
	try {
		return localStorage.getItem('lang') || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Wait for translations to be actually loaded and available
 */
async function waitForTranslationsLoaded(): Promise<void> {
	return new Promise((resolve) => {
		// Wait for a reasonable amount of time for translations to load
		// This is a simple but effective approach that gives the translation
		// loading process time to complete after init() resolves
		setTimeout(() => {
			console.log('[i18n] Waited for translation dictionary loading');
			resolve();
		}, 300); // 300ms should be sufficient for most translation loads
	});
}

/**
 * Initialize svelte-i18n on the client using server-provided locale
 */
export function initializeI18n(initialLocale?: string): Promise<void> {
	// Return existing promise if already initializing
	if (initializationPromise) {
		return initializationPromise;
	}

	// Return resolved promise if already initialized
	if (isInitialized) {
		return Promise.resolve();
	}

	initializationPromise = (async () => {
		try {
			const fallbackLocale: AppLocale = 'en';
			let detected: string | undefined = initialLocale;

			if (!detected && typeof window !== 'undefined') {
				// Prefer stored selection, then navigator
				detected = getLangLocal() || getLocaleFromNavigator();
			}

			// Normalize to supported
			const normalized = normalizeLocale(detected) || fallbackLocale;

			await init({
				fallbackLocale,
				initialLocale: normalized
			});

			// Wait for translations to actually be loaded
			await waitForTranslationsLoaded();

			// Keep <html lang> in sync and persist cookie/localStorage (browser only)
			if (typeof document !== 'undefined') {
				$locale.subscribe((loc: string | null) => {
					if (loc) {
						const nl = normalizeLocale(loc) || fallbackLocale;
						document.documentElement.lang = nl;
						setLangCookie(nl);
						setLangLocal(nl);
					}
				});
			}

			isInitialized = true;
			console.log(`[i18n] Initialized with locale: ${normalized} and translations loaded`);
		} catch (error) {
			console.error('[i18n] Initialization failed:', error);
			// Fallback to English if initialization fails
			try {
				console.log(`[i18n DEBUG] Attempting fallback initialization with English`);
				await init({
					fallbackLocale: 'en',
					initialLocale: 'en'
				});
				// Also wait for translations in fallback
				await waitForTranslationsLoaded();
				isInitialized = true;
				console.log('[i18n] Fallback initialization successful with English');
			} catch (fallbackError) {
				console.error('[i18n] Fallback initialization also failed:', fallbackError);
				// Even if fallback fails, mark as initialized to prevent infinite retries
				isInitialized = true;
			}
		} finally {
			initializationPromise = null;
		}
	})();

	return initializationPromise;
}

/**
 * Initialize i18n for server-side rendering
 */
export async function initializeI18nForSSR(initialLocale?: string): Promise<void> {
	try {
		const fallbackLocale: AppLocale = 'en';
		const normalized = normalizeLocale(initialLocale) || fallbackLocale;

		// Preload messages for initial + fallback locales to avoid fallback-to-English flashes
		try {
			const messages = await loadLocaleBundle(normalized);
			addMessages(normalized, messages);
		} catch (e) {
			// Ignore if we can't preload; init() still sets locale
		}

		try {
			// Ensure fallback messages are present
			const enMessages = await loadLocaleBundle('en');
			addMessages('en', enMessages);
		} catch {}

		// Initialize i18n for SSR
		await init({
			fallbackLocale,
			initialLocale: normalized
		});

		isInitialized = true;
		console.log(`[i18n SSR] Initialized with locale: ${normalized}`);
	} catch (error) {
		console.error('[i18n SSR] Initialization failed:', error);
		// Ensure we're initialized even if there's an error
		isInitialized = true;
	}
}

/**
 * Change the current locale dynamically
 */
export async function changeLocale(newLocale: string): Promise<void> {
	if (!isInitialized) {
		console.warn('[i18n] Cannot change locale before initialization');
		return;
	}

	try {
		const normalized = normalizeLocale(newLocale);
		if (!normalized) {
			console.error(`[i18n] Invalid locale: ${newLocale}`);
			return;
		}

		console.log(`[i18n] Attempting to change locale to: ${normalized}`);

		// Set the new locale in the svelte-i18n store
		$locale.set(normalized);

		// Persist selection for future SSR and reloads
		setLangCookie(normalized);
		setLangLocal(normalized);

		// Wait a bit to ensure the store update takes effect
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Update document lang attribute (only in browser)
		if (typeof document !== 'undefined') {
			document.documentElement.lang = normalized;
		}

		// Verify the change took effect
		const currentLocale = $locale;
		console.log(`[i18n] Locale changed to: ${normalized}`);
		console.log(`[i18n] Store verification - current locale: ${currentLocale}`);
		console.log(`[i18n] Document lang verification: ${document.documentElement.lang}`);
	} catch (error) {
		console.error('[i18n] Failed to change locale:', error);
		throw error; // Re-throw to let the caller handle it
	}
}

export function normalizeLocale(input?: string | null): AppLocale | undefined {
	if (!input) return undefined;
	const lc = input.toLowerCase();
	const short = lc.split('-')[0];
	if (SUPPORTED_LOCALES.includes(lc as AppLocale)) return lc as AppLocale;
	if (SUPPORTED_LOCALES.includes(short as AppLocale)) return short as AppLocale;
	return undefined;
}

// Export initialization status
export function getInitializationStatus() {
	return isInitialized;
}

// Export a function to wait for i18n to be ready
export async function waitForI18n(): Promise<void> {
	if (isInitialized) {
		return Promise.resolve();
	}

	if (initializationPromise) {
		return initializationPromise;
	}

	// If not initialized and no promise, initialize now
	return initializeI18n();
}
