/**
 * @fileoverview i18n Store - Track internationalization readiness state
 *
 * This store provides a reactive way to track whether the i18n system
 * is ready and translations are available. This prevents race conditions
 * where components try to use translations before they're loaded.
 *
 * @author bim
 * @version 1.0.0
 */

import { writable, get } from 'svelte/store';

// Store to track i18n initialization status
export const i18nReady = writable(false);

// Helper function to set i18n as ready
export function setI18nReady(ready: boolean = true) {
	i18nReady.set(ready);
}

// Helper function to wait for i18n to be ready
export function waitForI18nReady(): Promise<void> {
	return new Promise((resolve) => {
		// Check if already ready using get()
		if (get(i18nReady) === true) {
			resolve();
			return;
		}

		// Otherwise, wait for it to become ready
		const unsubscribe = i18nReady.subscribe((ready) => {
			if (ready) {
				unsubscribe();
				resolve();
			}
		});
	});
}
