/**
 * @fileoverview WebAuthn Operations Service
 *
 * Handles WebAuthn credential operations and challenge generation.
 */

import { PublicEnv } from '$lib/config/env';
import type { User } from '$lib/db';
import { randomBytes } from '$lib/utils/crypto';
import { logger } from '$lib/utils/logger';
import type { UserWithCredentials, WebAuthnCredentials } from './types';

/**
 * WebAuthn operations service
 */
export class WebAuthnService {
	private readonly rpId: string;
	private readonly origin: string;

	constructor() {
		this.rpId = PublicEnv.WEBAUTHN_RP_ID();
		// Use the actual browser origin if available, otherwise construct it
		if (typeof window !== 'undefined') {
			this.origin = window.location.origin;
		} else {
			// Server-side fallback - use https for production domains, http for localhost
			this.origin = this.rpId === 'localhost' ? `http://${this.rpId}` : `https://${this.rpId}`;
		}

		// Debug logging for WebAuthn configuration
		logger.info('WebAuthn service initialized', {
			rpId: this.rpId,
			origin: this.origin,
			configuredRpId: PublicEnv.WEBAUTHN_RP_ID(),
			fallbackRpId: this.rpId,
			isClient: typeof window !== 'undefined',
			windowOrigin: typeof window !== 'undefined' ? window.location.origin : 'N/A'
		});
	}

	/**
	 * Generate cryptographic challenge for WebAuthn operations
	 */
	generateChallenge(): Uint8Array {
		return randomBytes(32);
	}

	/**
	 * Create WebAuthn credentials structure from user data
	 */
	createCredentials(user: User): WebAuthnCredentials {
		console.log('🔍 DEBUG: Creating WebAuthn credentials from user:', {
			userId: user.id,
			username: user.username,
			hasCredentialId: !!user.credentialId,
			hasPublicKey: !!user.publicKey,
			credentialId: user.credentialId,
			publicKey: user.publicKey,
			rpId: this.rpId,
			origin: this.origin
		});

		const credentials = {
			rpId: this.rpId,
			origin: this.origin,
			credentialId: user.credentialId,
			publicKey: user.publicKey
		};

		console.log('🔍 DEBUG: Created WebAuthn credentials:', credentials);
		return credentials;
	}

	/**
	 * Enhance user with WebAuthn credentials and Starknet address
	 */
	async enhanceUserWithCredentials(user: User): Promise<UserWithCredentials> {
		// Calculate the user's Starknet account address
		let starknetAddress: string | undefined;
		try {
			// Import WebauthnAccountService dynamically using ES6 import for browser compatibility
			const { WebauthnAccountService } = await import('../webauthn-account.service');
			const accountService = new WebauthnAccountService();
			starknetAddress = await accountService.calculateAccountAddress(user);
		} catch (error) {
			console.error('Failed to calculate Starknet address during user enhancement:', error);
			// Don't fail the entire enhancement, just leave starknetAddress undefined
		}

		return {
			...user,
			webauthnCredentials: this.createCredentials(user),
			starknetAddress: starknetAddress || undefined
		};
	}

	/**
	 * Get WebAuthn configuration
	 */
	getConfig(): { rpId: string; origin: string } {
		return {
			rpId: this.rpId,
			origin: this.origin
		};
	}

	/**
	 * Validate credential ID format
	 */
	validateCredentialId(credentialId: string): boolean {
		// Basic validation - should be base64 encoded (with + / and = padding)
		return /^[A-Za-z0-9+/]+=*$/.test(credentialId) && credentialId.length > 0;
	}

	/**
	 * Validate public key format
	 */
	validatePublicKey(publicKey: string): boolean {
		// Basic validation - should be base64 encoded (with + / and = padding)
		return /^[A-Za-z0-9+/]+=*$/.test(publicKey) && publicKey.length > 0;
	}

	/**
	 * Validate WebAuthn credentials structure
	 */
	validateCredentials(credentials: WebAuthnCredentials): boolean {
		const isValid =
			credentials.rpId === this.rpId &&
			credentials.origin === this.origin &&
			this.validateCredentialId(credentials.credentialId) &&
			this.validatePublicKey(credentials.publicKey);

		// Debug logging for credential validation
		if (!isValid) {
			logger.warn('WebAuthn credential validation failed', {
				expected: {
					rpId: this.rpId,
					origin: this.origin
				},
				actual: {
					rpId: credentials.rpId,
					origin: credentials.origin
				},
				validations: {
					rpIdMatch: credentials.rpId === this.rpId,
					originMatch: credentials.origin === this.origin,
					credentialIdValid: this.validateCredentialId(credentials.credentialId),
					publicKeyValid: this.validatePublicKey(credentials.publicKey)
				}
			});
		}

		return isValid;
	}
}
