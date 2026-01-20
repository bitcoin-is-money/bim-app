/**
 * @fileoverview Client-side Authentication Store for WebAuthn
 *
 * This module provides reactive authentication state management for the client-side
 * application using Svelte stores. It acts as a bridge between the UI components
 * and the authentication service layer.
 *
 * Key Features:
 * - Reactive user state management with Svelte stores
 * - WebAuthn authentication integration
 * - Singleton pattern for consistent state
 * - Automatic state synchronization across components
 * - Type-safe authentication operations
 *
 * The store pattern provides:
 * - Centralized authentication state
 * - Automatic UI updates when auth state changes
 * - Consistent API for authentication operations
 * - Integration with SvelteKit's reactive system
 *
 * @requires svelte/store - Svelte's reactive store system
 * @requires $lib/db - Database types for User interface
 * @requires $lib/services - Authentication service layer
 *
 * @author bim
 * @version 1.0.0
 */

import { AuthService } from '$lib/services';
import type { UserWithCredentials } from '$lib/services/client/auth/types';
import { writable } from 'svelte/store';

/**
 * Reactive store for current authenticated user
 *
 * This writable store holds the current user state and automatically
 * triggers UI updates when the authentication state changes.
 *
 * Usage patterns:
 * - `$currentUser` - Access current value reactively
 * - `currentUser.subscribe(user => {})` - Listen for changes
 * - `currentUser.set(user)` - Update user state
 * - `currentUser.set(null)` - Clear user state (logout)
 *
 * @type {Writable<UserWithCredentials | null>}
 */
export const currentUser = writable<UserWithCredentials | null>(null);

/**
 * Singleton authentication service instance
 * Ensures consistent authentication state across the application
 */
const authService = AuthService.getInstance();

/**
 * Load current user from server and update store
 *
 * Fetches the current user session from the server and updates
 * the reactive store. This function is typically called on
 * application startup to restore authentication state.
 *
 * The function will:
 * - Query the server for current session
 * - Update the currentUser store with the result
 * - Handle authentication errors gracefully
 * - Return the user data for immediate use
 *
 * @returns Promise<User | null> - Current user or null if not authenticated
 *
 * @example
 * ```typescript
 * // In a component's onMount
 * onMount(async () => {
 *   const user = await loadCurrentUser();
 *   if (user) {
 *     console.log(`Welcome back, ${user.username}`);
 *   }
 * });
 * ```
 */
export async function loadCurrentUser() {
	const result = await authService.loadCurrentUser();

	// Update the currentUser store with the loaded user
	currentUser.set(result);

	// Dispatch custom event for loaded user
	if (result && typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent('auth-changed', {
				detail: { user: result }
			})
		);
	}

	return result;
}

/**
 * Authenticate user with WebAuthn credentials
 *
 * Performs WebAuthn authentication using the provided credential data.
 * This function handles the complete authentication flow including:
 * - Credential validation
 * - Session creation
 * - Store updates
 * - Error handling
 *
 * @param authData - WebAuthn authentication data
 * @param authData.credentialId - The credential identifier
 * @param authData.signature - The authentication signature
 * @param authData.authenticatorData - Authenticator-specific data
 * @param authData.clientDataJSON - Client data in JSON format
 *
 * @returns Promise<User | null> - Authenticated user or null if failed
 *
 * @example
 * ```typescript
 * // After WebAuthn ceremony
 * const user = await login({
 *   credentialId: credential.id,
 *   signature: response.signature,
 *   authenticatorData: response.authenticatorData,
 *   clientDataJSON: response.clientDataJSON
 * });
 *
 * if (user) {
 *   // Authentication successful
 *   console.log(`Logged in as ${user.username}`);
 * } else {
 *   // Authentication failed
 *   console.error('Login failed');
 * }
 * ```
 */
export async function login(authData: {
	credentialId: string;
	signature: string;
	authenticatorData: string;
	clientDataJSON: string;
}) {
	const result = await authService.login(authData);

	// Update the currentUser store immediately if login was successful
	if (result && result.success && result.user) {
		console.log('Login successful, updating currentUser store:', result.user);
		currentUser.set(result.user);

		// Dispatch custom event for successful login
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('user-logged-in', {
					detail: { user: result.user }
				})
			);
		}
	} else {
		console.log('Login failed or no user returned:', result);
	}

	return result;
}

/**
 * Log out the current user
 *
 * Performs complete logout including:
 * - Server-side session invalidation
 * - Cookie cleanup
 * - Store state reset
 * - Error handling
 * - Redirect to sign-in page
 *
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * // In a logout button handler
 * const handleLogout = async () => {
 *   await logout();
 *   // User is now logged out and redirected to sign-in page
 *   console.log('Logged out successfully');
 * };
 * ```
 */
export async function logout() {
	try {
		console.log('Logout: Starting logout process...');
		await authService.logout();
		console.log('Logout: Server logout completed');

		// Clear the current user from the store
		currentUser.set(null);
		console.log('Logout: User store cleared');

		// Redirect to home page where sign-in form will be shown
		if (typeof window !== 'undefined') {
			console.log('Logout: Redirecting to home page...');
			window.location.href = '/';
		}
	} catch (error) {
		console.error('Logout failed:', error);
		// Still clear user state and redirect even if server logout failed
		currentUser.set(null);
		if (typeof window !== 'undefined') {
			window.location.href = '/';
		}
	}
}
