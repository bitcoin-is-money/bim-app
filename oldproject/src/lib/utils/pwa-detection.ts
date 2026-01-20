/**
 * PWA Detection Utilities
 *
 * Functions to detect if the app is running as a PWA (installed)
 * vs in a regular browser environment.
 */

/**
 * Check if the app is running in standalone mode (installed as PWA)
 */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;

	// Check for standalone display mode
	if (window.matchMedia('(display-mode: standalone)').matches) {
		return true;
	}

	// Check for iOS standalone mode
	if ((window.navigator as any).standalone === true) {
		return true;
	}

	// Check for Android standalone mode
	if (window.location.search.includes('utm_source=pwa')) {
		return true;
	}

	return false;
}

/**
 * Check if the app is running in a mobile browser
 */
export function isMobileBrowser(): boolean {
	if (typeof window === 'undefined') return false;

	const userAgent = window.navigator.userAgent.toLowerCase();
	return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
}

/**
 * Get the display mode of the app
 */
export function getDisplayMode(): 'standalone' | 'browser' | 'minimal-ui' {
	if (typeof window === 'undefined') return 'browser';

	if (window.matchMedia('(display-mode: standalone)').matches) {
		return 'standalone';
	}

	if (window.matchMedia('(display-mode: minimal-ui)').matches) {
		return 'minimal-ui';
	}

	return 'browser';
}

/**
 * Check if the app should show PWA-specific features
 */
export function shouldShowPWAFeatures(): boolean {
	return isStandalone() || isMobileBrowser();
}

/**
 * Get the appropriate permission request strategy based on the environment
 */
export function getPermissionStrategy(): 'immediate' | 'click-based' | 'delayed' {
	if (isStandalone()) {
		// PWA installed - can request permissions immediately
		return 'immediate';
	} else if (isMobileBrowser()) {
		// Mobile browser - use click-based requests
		return 'click-based';
	} else {
		// Desktop browser - delay permission requests
		return 'delayed';
	}
}
