/**
 * Server-side WebAuthn credential data structure
 * Used for address calculation and verification without signing capabilities
 */

export interface WebauthnCredentialData {
	origin: string;
	rpId: string;
	credentialId: Uint8Array;
	pubKey: Uint8Array; // X-coordinate only (32 bytes)
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
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

/**
 * Create WebauthnCredentialData from stored user credentials
 * This is safe to use on both client and server
 */
export function createWebauthnCredentialData(
	rpId: string,
	origin: string,
	credentialId: string,
	publicKey: string
): WebauthnCredentialData {
	// Convert base64 strings back to Uint8Array
	const credentialIdBytes = base64ToUint8Array(credentialId);
	const pubKeyBytes = base64ToUint8Array(publicKey);

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

	return {
		origin,
		rpId,
		credentialId: credentialIdBytes,
		pubKey: rawPublicKey
	};
}
