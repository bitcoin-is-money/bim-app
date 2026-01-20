import { TIMEOUTS } from '$lib/constants';
import { buf2hex } from '$lib/utils/crypto';
import type { WebauthnAttestation } from '$lib/utils/webauthn';
import { requestSignature, WebauthnOwner } from '$lib/utils/webauthn';

export class WebauthnService {
	private static instance: WebauthnService;

	private constructor() {
		// No dependencies needed for simplified approach
	}

	static getInstance(): WebauthnService {
		if (!WebauthnService.instance) {
			WebauthnService.instance = new WebauthnService();
		}
		return WebauthnService.instance;
	}

	async createOwner(rpId: string, origin: string, username: string): Promise<WebauthnOwner> {
		console.log('creating webauthn key (attestation) using server-managed challenge...');

		// 1) Ask server for registration options (with challenge)
		const beginResp = await fetch('/api/webauthn/register/begin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username })
		});
		if (!beginResp.ok) {
			const err = await beginResp.json().catch(() => ({}));
			throw new Error(err.error || 'WebAuthn registration failed');
		}
		const { options } = await beginResp.json();

		// Convert JSON options to proper binary format for WebAuthn API
		const toBuffer = (b64url: string) => this.base64ToUint8Array(b64url);

		const publicKeyOptions: PublicKeyCredentialCreationOptions = {
			rp: options.rp,
			user: {
				id: toBuffer(options.user.id),
				name: options.user.name,
				displayName: options.user.displayName ?? options.user.name
			},
			challenge: toBuffer(options.challenge),
			pubKeyCredParams: options.pubKeyCredParams,
			timeout: options.timeout,
			attestation: options.attestation,
			authenticatorSelection: options.authenticatorSelection,
			excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
				id: toBuffer(c.id),
				type: c.type
			})),
			extensions: options.extensions
		} as any;

		// 2) Create credential in browser
		const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });
		if (!credential) {
			throw new Error('WebAuthn registration failed');
		}

		const attestationCredential = credential as PublicKeyCredential;
		const response = attestationCredential.response as AuthenticatorAttestationResponse;

		// Extract public key from WebAuthn - use Argent's approach (X-coordinate only)
		const publicKeyBuffer = response.getPublicKey();
		if (!publicKeyBuffer) {
			throw new Error('Failed to extract public key from passkey. Please try again.');
		}

		const publicKeyArray = new Uint8Array(publicKeyBuffer);

		// Use Argent's approach: extract only the X-coordinate
		// This assumes the public key is in a format where X is the last 64 bytes, first 32 bytes
		const x = publicKeyArray.slice(-64, -32);

		// Store only the X-coordinate (32 bytes) as per Argent's example
		const rawPublicKey = x;

		// 3) Serialize attestation for server verification
		const toBase64url = (bytes: ArrayBufferLike) =>
			btoa(String.fromCharCode(...new Uint8Array(bytes)))
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=+$/g, '');

		const attestation = {
			id: toBase64url(attestationCredential.rawId),
			rawId: toBase64url(attestationCredential.rawId),
			type: attestationCredential.type,
			authenticatorAttachment: (attestationCredential as any).authenticatorAttachment,
			response: {
				attestationObject: toBase64url(response.attestationObject),
				clientDataJSON: toBase64url(response.clientDataJSON),
				transports: (response as any).getTransports?.() || undefined
			},
			clientExtensionResults: (attestationCredential.getClientExtensionResults?.() || {}) as any
		};

		// 4) Complete registration on server (verifies attestation, stores credential & session)
		const completeResp = await fetch('/api/webauthn/register/complete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, attestation })
		});
		const completeJson = await completeResp.json();
		if (!completeResp.ok || !completeJson.success) {
			throw new Error(completeJson.error || 'WebAuthn registration failed');
		}

		// 5) Build WebauthnOwner for Starknet signing
		const attestationStruct: WebauthnAttestation = {
			origin,
			rpId,
			credentialId: new Uint8Array(attestationCredential.rawId),
			pubKey: rawPublicKey
		};

		return new WebauthnOwner(attestationStruct, requestSignature);
	}

	async authenticateWithPasskey(
		rpId: string,
		challenge: Uint8Array,
		credentialId?: string
	): Promise<{
		credentialId: string;
		signature: string;
		authenticatorData: string;
		clientDataJSON: string;
	}> {
		try {
			// Prepare publicKey options
			const publicKeyOptions: any = {
				rpId: rpId,
				challenge: challenge,
				userVerification: 'required',
				timeout: TIMEOUTS.WEBAUTHN_GET
			};

			// If credentialId is provided, filter to only show this specific credential
			if (credentialId) {
				try {
					const credentialIdBytes = this.base64ToUint8Array(credentialId);
					console.log('🔐 WebAuthn: Filtering to specific credential:', {
						credentialId,
						credentialIdBytesLength: credentialIdBytes.length,
						firstBytes: Array.from(credentialIdBytes.slice(0, 4))
					});

					publicKeyOptions.allowCredentials = [
						{
							id: credentialIdBytes,
							type: 'public-key'
						}
					];
				} catch (error) {
					console.warn('🔐 WebAuthn: Failed to filter credentials, falling back to all:', error);
					// Fall back to showing all credentials if filtering fails
				}
			} else {
				console.log('🔐 WebAuthn: No credential filtering - showing all available passkeys');
			}

			console.log('🔐 WebAuthn: Starting authentication with options:', {
				rpId,
				timeout: publicKeyOptions.timeout,
				hasCredentialFilter: !!credentialId,
				userVerification: publicKeyOptions.userVerification
			});

			console.log('🔐 WebAuthn: About to call navigator.credentials.get with:', publicKeyOptions);

			// Request WebAuthn assertion with increased timeout
			const credential = await navigator.credentials.get({
				publicKey: publicKeyOptions
			});

			console.log(
				'🔐 WebAuthn: navigator.credentials.get completed, credential:',
				credential ? 'EXISTS' : 'NULL'
			);

			if (!credential) {
				throw new Error('No passkey selected');
			}

			const assertion = credential as PublicKeyCredential;
			const response = assertion.response as AuthenticatorAssertionResponse;

			console.log('🔐 WebAuthn: Processing credential response:', {
				hasResponse: !!response,
				responseType: response?.constructor?.name,
				hasSignature: !!response?.signature,
				hasAuthenticatorData: !!response?.authenticatorData,
				hasClientDataJSON: !!response?.clientDataJSON
			});

			return {
				credentialId: btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))),
				signature: buf2hex(new Uint8Array(response.signature).buffer as ArrayBuffer),
				authenticatorData: buf2hex(
					new Uint8Array(response.authenticatorData).buffer as ArrayBuffer
				),
				clientDataJSON: buf2hex(new Uint8Array(response.clientDataJSON).buffer as ArrayBuffer)
			};
		} catch (error) {
			// Provide more helpful error messages for common WebAuthn errors
			if (error instanceof Error) {
				console.error('🔐 WebAuthn: Authentication error:', {
					name: error.name,
					message: error.message,
					stack: error.stack
				});

				if (error.name === 'NotAllowedError') {
					throw new Error('WebAuthn authentication was not allowed');
				} else if (error.name === 'InvalidStateError') {
					throw new Error('WebAuthn authentication is in invalid state');
				} else if (error.name === 'SecurityError') {
					throw new Error('WebAuthn security error');
				} else if (error.name === 'NotSupportedError') {
					throw new Error('WebAuthn is not supported');
				} else if (error.name === 'TimeoutError') {
					throw new Error('WebAuthn authentication timed out');
				}
			}

			// Re-throw original error if it's not a known WebAuthn error
			throw error;
		}
	}

	createOwnerFromStoredCredentials(
		rpId: string,
		origin: string,
		credentialId: string,
		publicKey: string
	): WebauthnOwner {
		// Convert base64 strings back to Uint8Array
		const credentialIdBytes = this.base64ToUint8Array(credentialId);
		const pubKeyBytes = this.base64ToUint8Array(publicKey);

		// Handle different public key formats - use X-coordinate only approach
		let rawPublicKey: Uint8Array;
		if (pubKeyBytes.length === 32) {
			// Already X-coordinate only (32 bytes)
			rawPublicKey = pubKeyBytes;
		} else if (pubKeyBytes.length === 65 && pubKeyBytes[0] === 0x04) {
			// Uncompressed format (0x04 + X + Y) - extract X only
			rawPublicKey = pubKeyBytes.slice(1, 33); // Skip 0x04, take X (32 bytes)
		} else if (pubKeyBytes.length > 65) {
			// SPKI format: find the 0x04 marker and extract X
			const idx = pubKeyBytes.findIndex((b) => b === 0x04);
			if (idx !== -1 && idx + 65 <= pubKeyBytes.length) {
				const uncompressedKey = pubKeyBytes.slice(idx, idx + 65);
				rawPublicKey = uncompressedKey.slice(1, 33); // Extract X only
			} else {
				throw new Error(`Unable to parse SPKI public key. Length: ${pubKeyBytes.length}`);
			}
		} else if (pubKeyBytes.length === 91) {
			// COSE format: extract X-coordinate using simple slice approach
			// This is a simplified approach - in practice you might need proper COSE parsing
			rawPublicKey = pubKeyBytes.slice(-64, -32); // Extract X-coordinate
		} else {
			throw new Error(
				`Invalid public key length: expected 32, 65, 91, or >65 bytes, got ${pubKeyBytes.length}`
			);
		}

		// Create WebauthnAttestation object with simplified structure
		const attestation: WebauthnAttestation = {
			origin: origin,
			rpId: rpId,
			credentialId: credentialIdBytes,
			pubKey: rawPublicKey
		};

		return new WebauthnOwner(attestation, requestSignature);
	}

	private base64ToUint8Array(base64: string): Uint8Array {
		// Detect format first, then use appropriate decoder
		const hasBase64Chars = /[+/]/.test(base64);
		const isBase64urlFormat = /^[A-Za-z0-9_-]+$/.test(base64);

		if (hasBase64Chars) {
			// Has + or / characters - definitely regular base64
			const binaryString = atob(base64);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
			return bytes;
		} else if (isBase64urlFormat) {
			// Only contains base64url-safe characters - convert to regular base64
			const base64Regular = base64
				.replace(/-/g, '+')
				.replace(/_/g, '/')
				// Add padding if needed
				.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

			const binaryString = atob(base64Regular);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
			return bytes;
		} else {
			// Mixed format or unknown - try regular base64 first
			try {
				const binaryString = atob(base64);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				return bytes;
			} catch (base64Error) {
				// Fallback to base64url conversion
				try {
					const base64Regular = base64
						.replace(/-/g, '+')
						.replace(/_/g, '/')
						.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

					const binaryString = atob(base64Regular);
					const bytes = new Uint8Array(binaryString.length);
					for (let i = 0; i < binaryString.length; i++) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					return bytes;
				} catch (base64urlError) {
					throw new Error(
						`Failed to decode base64 string: Base64 (${base64Error.message}), Base64URL (${base64urlError.message})`
					);
				}
			}
		}
	}
}
