import { TIMEOUTS, WEBAUTHN_CONFIG } from '$lib/constants';
import { randomBytes } from '../crypto';

export interface WebauthnAttestation {
	origin: string;
	rpId: string;
	credentialId: Uint8Array;
	pubKey: Uint8Array; // X-coordinate only (32 bytes) - following Argent's approach
}

export const createWebauthnAttestation = async (
	rpId: string,
	origin: string,
	username: string
): Promise<WebauthnAttestation> => {
	try {
		const id = randomBytes(WEBAUTHN_CONFIG.USER_ID_SIZE);
		const challenge = randomBytes(WEBAUTHN_CONFIG.CHALLENGE_SIZE);

		const credential = await navigator.credentials.create({
			publicKey: {
				rp: { id: rpId, name: WEBAUTHN_CONFIG.RP_NAME },
				user: { id, name: username, displayName: username },
				challenge,
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 } // -7 means secp256r1 with SHA-256 (ES256). RS256 not supported on purpose.
				],
				authenticatorSelection: {
					authenticatorAttachment: WEBAUTHN_CONFIG.AUTHENTICATOR_SELECTION.authenticatorAttachment,
					residentKey: 'preferred',
					requireResidentKey: WEBAUTHN_CONFIG.AUTHENTICATOR_SELECTION.requireResidentKey,
					userVerification: WEBAUTHN_CONFIG.AUTHENTICATOR_SELECTION.userVerification
				},
				attestation: 'none',
				extensions: { credProps: true },
				timeout: TIMEOUTS.WEBAUTHN_CREATE
			}
		});

		if (!credential) {
			throw new Error(
				'Passkey creation was cancelled. Please try again and complete the passkey setup when prompted.'
			);
		}

		const attestation = credential as PublicKeyCredential;
		const attestationResponse = attestation.response as AuthenticatorAttestationResponse;

		const credentialId = new Uint8Array(attestation.rawId);
		const publicKeyBuffer = attestationResponse.getPublicKey();

		if (!publicKeyBuffer) {
			throw new Error('Failed to extract public key from passkey. Please try again.');
		}

		// Use Argent's approach: extract only the X-coordinate
		const publicKeyArray = new Uint8Array(publicKeyBuffer);

		// Extract X-coordinate using Argent's method: last 64 bytes, first 32 bytes
		const x = publicKeyArray.slice(-64, -32);

		// Store only the X-coordinate (32 bytes) as per Argent's example
		return { rpId, origin, credentialId, pubKey: x };
	} catch (error) {
		// Provide more helpful error messages for common WebAuthn creation errors
		if (error instanceof Error) {
			if (error.name === 'NotAllowedError') {
				throw new Error(
					'Passkey creation was cancelled or timed out. Please try again and complete the setup when prompted.'
				);
			} else if (error.name === 'InvalidStateError') {
				throw new Error(
					'A passkey with this username may already exist. Please try a different username or use the existing passkey to sign in.'
				);
			} else if (error.name === 'SecurityError') {
				throw new Error("Security error. Please ensure you're using HTTPS and try again.");
			} else if (error.name === 'NotSupportedError') {
				throw new Error(
					'Passkeys are not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.'
				);
			} else if (error.name === 'ConstraintError') {
				throw new Error(
					'Passkey creation failed due to device constraints. Please try again or use a different device.'
				);
			}
		}

		// Re-throw original error if it's not a known WebAuthn error
		throw error;
	}
};

export const requestSignature = async (
	attestation: WebauthnAttestation,
	challenge: Uint8Array
): Promise<AuthenticatorAssertionResponse> => {
	const credential = await navigator.credentials.get({
		publicKey: {
			rpId: attestation.rpId,
			challenge,
			allowCredentials: [
				{
					id: attestation.credentialId,
					type: 'public-key',
					transports: ['internal']
				}
			],
			userVerification: WEBAUTHN_CONFIG.AUTHENTICATOR_SELECTION.userVerification,
			timeout: TIMEOUTS.WEBAUTHN_GET
		}
	});
	if (!credential) {
		throw new Error('No credential');
	}

	const assertion = credential as PublicKeyCredential;
	return assertion.response as AuthenticatorAssertionResponse;
};
