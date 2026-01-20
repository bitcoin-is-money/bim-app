export const TEST_FIXTURES = {
	// Test challenge (base64url encoded)
	challenge: 'dGVzdC1jaGFsbGVuZ2U',

	// Test RP info
	rp: {
		name: 'BIM Test',
		id: 'localhost'
	},

	// Test user info
	user: {
		id: new Uint8Array([1, 2, 3, 4, 5]),
		name: 'test@example.com',
		displayName: 'Test User'
	},

	// Test public key credential parameters
	pubKeyCredParams: [
		{
			type: 'public-key' as const,
			alg: -7 // ES256
		}
	],

	// Test authenticator selection
	authenticatorSelection: {
		authenticatorAttachment: 'platform' as const,
		userVerification: 'required' as const,
		requireResidentKey: false
	},

	// Test credential creation options
	credentialCreationOptions: {
		publicKey: {
			challenge: new Uint8Array([
				116, 101, 115, 116, 45, 99, 104, 97, 108, 108, 101, 110, 103, 101
			]),
			rp: {
				name: 'BIM Test',
				id: 'localhost'
			},
			user: {
				id: new Uint8Array([1, 2, 3, 4, 5]),
				name: 'test@example.com',
				displayName: 'Test User'
			},
			pubKeyCredParams: [
				{
					type: 'public-key' as const,
					alg: -7
				}
			],
			authenticatorSelection: {
				authenticatorAttachment: 'platform' as const,
				userVerification: 'required' as const,
				requireResidentKey: false
			},
			timeout: 60000,
			attestation: 'none' as const
		}
	},

	// Test credential request options
	credentialRequestOptions: {
		publicKey: {
			challenge: new Uint8Array([
				116, 101, 115, 116, 45, 99, 104, 97, 108, 108, 101, 110, 103, 101
			]),
			allowCredentials: [
				{
					type: 'public-key' as const,
					id: new Uint8Array([
						116, 101, 115, 116, 45, 99, 114, 101, 100, 101, 110, 116, 105, 97, 108
					])
				}
			],
			userVerification: 'required' as const,
			timeout: 60000
		}
	},

	// Test Starknet signature components
	starknetSignature: {
		r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
		s: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
	},

	// Test transaction hash
	transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',

	// Test account address
	accountAddress: '0x1234567890abcdef1234567890abcdef12345678'
};

export function createTestChallenge(): Uint8Array {
	return new Uint8Array([116, 101, 115, 116, 45, 99, 104, 97, 108, 108, 101, 110, 103, 101]);
}

export function createTestCredentialId(): Uint8Array {
	return new Uint8Array([116, 101, 115, 116, 45, 99, 114, 101, 100, 101, 110, 116, 105, 97, 108]);
}

export function createTestPublicKey(): Uint8Array {
	// Mock P-256 public key (uncompressed format: 0x04 + 32 bytes x + 32 bytes y)
	const publicKey = new Uint8Array(65);
	publicKey[0] = 0x04; // Uncompressed point indicator
	crypto.getRandomValues(publicKey.subarray(1, 33)); // x coordinate
	crypto.getRandomValues(publicKey.subarray(33, 65)); // y coordinate
	return publicKey;
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i] || 0);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
	const base64 = base64url
		.replace(/-/g, '+')
		.replace(/_/g, '/')
		.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');

	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}
