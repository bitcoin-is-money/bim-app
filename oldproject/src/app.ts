/**
 * @fileoverview Application initialization and global service setup
 *
 * This file handles the core application initialization for the WebAuthn Starknet
 * account deployment system. It sets up global services that need to be available
 * throughout the application lifecycle.
 *
 * Initialization includes:
 * - Monitoring and error tracking setup
 * - Structured logging system configuration
 * - Environment validation and configuration
 * - Global error handling and reporting
 * - Performance monitoring baseline establishment
 * - Internationalization (i18n) setup
 *
 * The initialization is environment-aware and only runs server-side setup
 * when executed in a Node.js environment (not in the browser).
 *
 * @requires $lib/utils/monitoring - Application monitoring and alerting
 * @requires $lib/utils/logger - Structured logging system
 * @requires $lib/i18n - Internationalization system
 *
 * @author bim
 * @version 1.0.0
 */

// All server-side initialization has been moved to src/hooks.server.ts

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/service-worker.js');
	});
}

// Initialize i18n globally for browser environment
if (typeof window !== 'undefined') {
	// Import and initialize i18n as early as possible
	import('$lib/i18n')
		.then(({ initializeI18n }) => {
			// Try to get locale from cookie or default to 'en'
			const getCookieLocale = () => {
				const cookies = document.cookie.split(';');
				for (const cookie of cookies) {
					const [name, value] = cookie.trim().split('=');
					if (name === 'lang') {
						return value;
					}
				}
				return 'en';
			};

			const locale = getCookieLocale();
			return initializeI18n(locale);
		})
		.catch((error) => {
			console.warn('Failed to initialize i18n globally:', error);
		});
}
