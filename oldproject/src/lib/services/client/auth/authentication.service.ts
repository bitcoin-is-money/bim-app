/**
 * @fileoverview Authentication Operations Service
 *
 * Handles authentication flow operations including login, registration, and logout.
 */

import type { User } from '$lib/db';
import { SessionService } from './session.service';
import type { AuthData, AuthResult, RegistrationData, UserWithCredentials } from './types';
import { WebAuthnService } from './webauthn.service';

/**
 * Authentication operations service
 */
export class AuthenticationService {
	private webauthnService: WebAuthnService;
	private sessionService: SessionService;

	constructor(webauthnService: WebAuthnService, sessionService: SessionService) {
		this.webauthnService = webauthnService;
		this.sessionService = sessionService;
	}

	/**
	 * Load current user from server with caching
	 */
	async loadCurrentUser(): Promise<UserWithCredentials | null> {
		// Check cache first for performance optimization
		const cachedUser = this.sessionService.getCachedCurrentUser();
		if (cachedUser) {
			return cachedUser;
		}

		try {
			// Fetch current user from server
			const response = await fetch('/api/user/me');

			if (response.ok) {
				const data = await response.json();
				const user: User = data.user;

				console.log('🔍 DEBUG: User data from /api/user/me:', {
					user,
					hasCredentialId: !!user.credentialId,
					hasPublicKey: !!user.publicKey,
					credentialIdLength: user.credentialId?.length,
					publicKeyLength: user.publicKey?.length
				});

				// Create UserWithCredentials by adding WebAuthn credentials structure
				const userWithCredentials = await this.webauthnService.enhanceUserWithCredentials(user);

				console.log('🔍 DEBUG: Enhanced user with credentials:', {
					userWithCredentials,
					hasWebauthnCredentials: !!userWithCredentials.webauthnCredentials,
					credentialsKeys: userWithCredentials.webauthnCredentials
						? Object.keys(userWithCredentials.webauthnCredentials)
						: null
				});

				// Update cache and reactive store
				this.sessionService.updateCurrentUser(userWithCredentials);
				return userWithCredentials;
			} else {
				// Clear user state if not authenticated
				this.sessionService.clearCurrentUser();
				return null;
			}
		} catch (error) {
			// Handle network errors gracefully
			console.error('Failed to load current user:', error);
			this.sessionService.clearCurrentUser();
			return null;
		}
	}

	/**
	 * Authenticate user with WebAuthn credentials
	 */
	async login(_authData?: AuthData): Promise<AuthResult> {
		try {
			// Ask server for authentication options (with challenge)
			const beginResp = await fetch('/api/webauthn/authenticate/begin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			if (!beginResp.ok) {
				const err = await beginResp.json().catch(() => ({}));
				return { success: false, error: err.error || 'Login failed' };
			}
			const { options } = await beginResp.json();

			// Convert to WebAuthn API format
			const b64urlToBytes = (b64url: string) => {
				const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
				const bin = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				return bytes;
			};

			const publicKeyOptions: PublicKeyCredentialRequestOptions = {
				challenge: b64urlToBytes(options.challenge),
				timeout: options.timeout,
				rpId: options.rpId ?? options.rpID,
				userVerification: options.userVerification,
				allowCredentials: (options.allowCredentials || []).map((c: any) => ({
					id: b64urlToBytes(c.id),
					type: c.type,
					transports: c.transports
				}))
			} as any;

			// Request assertion from authenticator
			const credential = await navigator.credentials.get({ publicKey: publicKeyOptions });
			if (!credential) return { success: false, error: 'No credential' };

			const assertion = credential as PublicKeyCredential;
			const response = assertion.response as AuthenticatorAssertionResponse;

			const toBase64url = (bytes: ArrayBufferLike) =>
				btoa(String.fromCharCode(...new Uint8Array(bytes)))
					.replace(/\+/g, '-')
					.replace(/\//g, '_')
					.replace(/=+$/g, '');

			const assertionJson = {
				id: toBase64url(assertion.rawId),
				rawId: toBase64url(assertion.rawId),
				type: assertion.type,
				authenticatorAttachment: (assertion as any).authenticatorAttachment,
				response: {
					authenticatorData: toBase64url(response.authenticatorData),
					clientDataJSON: toBase64url(response.clientDataJSON),
					signature: toBase64url(response.signature),
					userHandle: response.userHandle ? toBase64url(response.userHandle) : undefined
				},
				clientExtensionResults: assertion.getClientExtensionResults?.() || {}
			};

			// Complete authentication on server
			const completeResp = await fetch('/api/webauthn/authenticate/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assertion: assertionJson })
			});
			const completeJson = await completeResp.json();
			if (!completeResp.ok || !completeJson.success) {
				return { success: false, error: completeJson.error || 'Login failed' };
			}

			const user: User = completeJson.user;
			const userWithCredentials = await this.webauthnService.enhanceUserWithCredentials(user);
			this.sessionService.updateCurrentUser(userWithCredentials);
			return { success: true, user: userWithCredentials };
		} catch (error) {
			console.error('Login failed:', error);
			return { success: false, error: 'Network error' };
		}
	}

	/**
	 * Register new user with WebAuthn credentials
	 */
	async register(registrationData: RegistrationData): Promise<AuthResult> {
		try {
			// Validate registration data
			if (!this.webauthnService.validateCredentialId(registrationData.credentialId)) {
				return { success: false, error: 'Invalid credential ID format' };
			}

			if (!this.webauthnService.validatePublicKey(registrationData.publicKey)) {
				return { success: false, error: 'Invalid public key format' };
			}

			// Send registration data to server
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(registrationData)
			});

			if (!response.ok) {
				// Handle server errors
				const error = await response.json();
				return {
					success: false,
					error: error.error || 'Failed to register user'
				};
			}

			const result = await response.json();
			console.log('User registered successfully:', result.user);

			// Create enhanced user with credentials
			const user: User = result.user;
			const userWithCredentials = await this.webauthnService.enhanceUserWithCredentials(user);

			// Update cache with enhanced user data
			this.sessionService.updateCurrentUser(userWithCredentials);

			return { success: true, user: userWithCredentials };
		} catch (error) {
			// Handle network errors
			console.error('Failed to register user:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Registration failed'
			};
		}
	}

	/**
	 * Log out the current user
	 */
	async logout(): Promise<void> {
		try {
			// Send logout request to server
			await fetch('/api/auth/logout', { method: 'POST' });

			// Clear client-side session
			this.sessionService.clearCurrentUser();
		} catch (error) {
			// Handle network errors gracefully
			console.error('Failed to logout:', error);
			// Still clear local session even if server request failed
			this.sessionService.clearCurrentUser();
		}
	}

	/**
	 * Check if user is currently authenticated
	 */
	isAuthenticated(): boolean {
		return this.sessionService.hasValidSession();
	}

	/**
	 * Refresh current user data
	 */
	async refreshCurrentUser(): Promise<UserWithCredentials | null> {
		// Clear cache to force fresh load
		this.sessionService.clearCurrentUser();
		return await this.loadCurrentUser();
	}
}
