/**
 * @fileoverview Authentication Types and Interfaces
 *
 * Shared types and interfaces for the authentication system.
 */

import type { User } from '$lib/db';

/**
 * WebAuthn credentials structure for Lightning claim operations
 */
export interface WebAuthnCredentials {
	/** WebAuthn Relying Party ID */
	rpId: string;
	/** WebAuthn origin */
	origin: string;
	/** Base64url-encoded credential identifier */
	credentialId: string;
	/** Base64url-encoded public key */
	publicKey: string;
}

/**
 * Extended User interface that includes WebAuthn credentials
 */
export interface UserWithCredentials extends User {
	/** WebAuthn credentials for signer creation */
	webauthnCredentials: WebAuthnCredentials;
	/** Starknet address for the user's account */
	starknetAddress?: string;
}

/**
 * Authentication data structure for WebAuthn login
 */
export interface AuthData {
	/** Base64url-encoded credential identifier */
	credentialId: string;
	/** Base64url-encoded authentication signature */
	signature: string;
	/** Base64url-encoded authenticator data */
	authenticatorData: string;
	/** Base64url-encoded client data in JSON format */
	clientDataJSON: string;
}

/**
 * Authentication result structure
 */
export interface AuthResult {
	/** Whether the authentication operation was successful */
	success: boolean;
	/** User data if authentication was successful */
	user?: UserWithCredentials;
	/** Error message if authentication failed */
	error?: string;
}

/**
 * Registration data structure for new user creation
 */
export interface RegistrationData {
	/** Human-readable username */
	username: string;
	/** Base64url-encoded credential identifier */
	credentialId: string;
	/** Base64url-encoded public key */
	publicKey: string;
}
