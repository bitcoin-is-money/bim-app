/**
 * @fileoverview Authentication Module - Main Export
 *
 * Centralized export for all authentication services and types.
 * Provides both the new modular services and a backward-compatible facade.
 */

// Export types
export * from './types';

// Export services
export { SessionService } from './session.service';
export { WebAuthnService } from './webauthn.service';
export { AuthenticationService } from './authentication.service';

// Import services for facade
import { SessionService } from './session.service';
import { WebAuthnService } from './webauthn.service';
import { AuthenticationService } from './authentication.service';

/**
 * Authentication Service Facade
 *
 * Provides the same interface as the original AuthService while
 * delegating to the new modular services internally.
 */
export class AuthService {
	private static instance: AuthService;

	private sessionService: SessionService;
	private webauthnService: WebAuthnService;
	private authenticationService: AuthenticationService;

	private constructor() {
		this.sessionService = new SessionService();
		this.webauthnService = new WebAuthnService();
		this.authenticationService = new AuthenticationService(
			this.webauthnService,
			this.sessionService
		);
	}

	/**
	 * Get singleton instance of AuthService
	 */
	static getInstance(): AuthService {
		if (!AuthService.instance) {
			AuthService.instance = new AuthService();
		}
		return AuthService.instance;
	}

	/**
	 * Load current user from server with caching
	 */
	async loadCurrentUser() {
		return this.authenticationService.loadCurrentUser();
	}

	/**
	 * Authenticate user with WebAuthn credentials
	 */
	async login(authData: any) {
		return this.authenticationService.login(authData);
	}

	/**
	 * Register new user with WebAuthn credentials
	 */
	async register(registrationData: any) {
		return this.authenticationService.register(registrationData);
	}

	/**
	 * Log out the current user
	 */
	async logout() {
		return this.authenticationService.logout();
	}

	/**
	 * Generate cryptographic challenge for WebAuthn operations
	 */
	generateChallenge() {
		return this.webauthnService.generateChallenge();
	}

	/**
	 * Clear all cached data
	 */
	clearCache() {
		this.sessionService.clear();
	}

	// Expose individual services for advanced usage
	get session() {
		return this.sessionService;
	}

	get webauthn() {
		return this.webauthnService;
	}

	get authentication() {
		return this.authenticationService;
	}
}
