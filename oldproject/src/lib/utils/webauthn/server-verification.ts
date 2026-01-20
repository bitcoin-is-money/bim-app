/**
 * @fileoverview Server-side WebAuthn signature verification
 *
 * Implements proper server-side verification of WebAuthn assertions
 * following the W3C WebAuthn specification.
 */

import { p256 as secp256r1 } from '@noble/curves/nist.js';
import { ECDSASigValue } from '@peculiar/asn1-ecc';
import { AsnParser } from '@peculiar/asn1-schema';
import { hex2buf, base64url2buf } from '../crypto';
import { sha256 as jssha256 } from 'js-sha256';

const DEBUG =
	typeof process !== 'undefined' &&
	(process.env.DEBUG_WEB_AUTHN === '1' || process.env.DEBUG_WEB_AUTHN === 'true');

function sha256(message: any): Uint8Array {
	const hash = jssha256(message);
	return hex2buf(hash);
}

/**
 * Parse ASN.1 DER encoded signature into r and s components
 */
function parseASN1Signature(asn1Signature: Uint8Array): {
	r: bigint;
	s: bigint;
} {
	const signature = AsnParser.parse(asn1Signature, ECDSASigValue);

	let r = new Uint8Array(signature.r);
	let s = new Uint8Array(signature.s);

	// Remove leading zero bytes if present (ASN.1 padding)
	const shouldRemoveLeadingZero = (bytes: Uint8Array): boolean =>
		bytes[0] === 0x0 && bytes[1] !== undefined && (bytes[1] & (1 << 7)) !== 0;

	if (shouldRemoveLeadingZero(r)) {
		r = r.slice(1);
	}
	if (shouldRemoveLeadingZero(s)) {
		s = s.slice(1);
	}

	// Convert to bigint
	const rBigInt = BigInt(
		'0x' +
			Array.from(r)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
	);
	const sBigInt = BigInt(
		'0x' +
			Array.from(s)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
	);

	return { r: rBigInt, s: sBigInt };
}

/**
 * Create message hash for WebAuthn signature verification
 * This follows the WebAuthn specification for creating the signed message
 */
function createMessageHash(authenticatorData: Uint8Array, clientDataJSON: Uint8Array): Uint8Array {
	// The message that was signed is: authenticatorData || sha256(clientDataJSON)
	const clientDataHash = sha256(clientDataJSON);
	const message = new Uint8Array(authenticatorData.length + clientDataHash.length);
	message.set(authenticatorData, 0);
	message.set(clientDataHash, authenticatorData.length);

	// Hash the combined message
	return sha256(message);
}

/**
 * Verify WebAuthn assertion signature
 *
 * @param signature - Hex-encoded signature from WebAuthn assertion
 * @param authenticatorData - Hex-encoded authenticator data
 * @param clientDataJSON - Hex-encoded client data JSON
 * @param publicKey - Base64url-encoded public key (x coordinate only)
 * @param challenge - Expected challenge (base64url encoded)
 * @returns Verification result with success flag and details
 */
export async function verifyWebAuthnAssertion({
	signature,
	authenticatorData,
	clientDataJSON,
	publicKey,
	challenge
}: {
	signature: string;
	authenticatorData: string;
	clientDataJSON: string;
	publicKey: string;
	challenge?: string;
}): Promise<{
	success: boolean;
	error?: string;
	details?: any;
}> {
	try {
		// Strip optional "0x" prefix from hex strings before processing
		const cleanSignature = signature.startsWith('0x') ? signature.slice(2) : signature;
		const cleanAuthenticatorData = authenticatorData.startsWith('0x')
			? authenticatorData.slice(2)
			: authenticatorData;
		const cleanClientDataJSON = clientDataJSON.startsWith('0x')
			? clientDataJSON.slice(2)
			: clientDataJSON;

		// Convert hex strings to Uint8Arrays
		const signatureBytes = hex2buf(cleanSignature);
		const authenticatorDataBytes = hex2buf(cleanAuthenticatorData);
		const clientDataJSONBytes = hex2buf(cleanClientDataJSON);

		// Parse the signature
		DEBUG &&
			console.log('🔍 DEBUG: Signature parsing details:', {
				signatureHexLength: cleanSignature.length,
				signatureBytesLength: signatureBytes.length,
				signatureBytesPreview: Array.from(signatureBytes.slice(0, 16)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				)
			});

		const { r, s } = parseASN1Signature(signatureBytes);

		DEBUG &&
			console.log('🔍 DEBUG: Parsed signature components:', {
				r: r.toString(16),
				rLength: r.toString(16).length,
				s: s.toString(16),
				sLength: s.toString(16).length
			});

		// Create the message hash that was signed
		const messageHash = createMessageHash(authenticatorDataBytes, clientDataJSONBytes);

		// Convert public key to point coordinates
		// Note: The stored public key is only the x coordinate
		// Detect format first, then use appropriate decoder
		let publicKeyBytes: Uint8Array;
		let decodingMethod = 'unknown';

		// Detect the actual format by checking for format-specific characters
		const hasBase64Chars = /[+/]/.test(publicKey);
		const hasBase64urlChars = /[-_]/.test(publicKey);
		const isBase64urlFormat = /^[A-Za-z0-9_-]+$/.test(publicKey);

		DEBUG &&
			console.log('🔍 DEBUG: Public key format detection:', {
				publicKeyLength: publicKey.length,
				publicKeyPreview: publicKey.slice(0, 20) + '...',
				hasBase64Chars,
				hasBase64urlChars,
				isBase64urlFormat,
				detectedFormat: hasBase64Chars ? 'base64' : isBase64urlFormat ? 'base64url' : 'unknown'
			});

		if (hasBase64Chars) {
			// Has + or / characters - definitely regular base64
			try {
				const binaryString = atob(publicKey);
				publicKeyBytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					publicKeyBytes[i] = binaryString.charCodeAt(i);
				}
				decodingMethod = 'base64';
				DEBUG && console.log('🔍 DEBUG: Successfully decoded as base64');
			} catch (base64Error) {
				throw new Error(`Base64 decoding failed: ${base64Error.message}`);
			}
		} else if (isBase64urlFormat) {
			// Only contains base64url-safe characters - use base64url decoder
			try {
				publicKeyBytes = base64url2buf(publicKey);
				decodingMethod = 'base64url';
				DEBUG && console.log('🔍 DEBUG: Successfully decoded as base64url');
			} catch (base64urlError) {
				throw new Error(`Base64URL decoding failed: ${base64urlError.message}`);
			}
		} else {
			// Mixed format or unknown - try both with proper error handling
			let lastError = '';
			try {
				const binaryString = atob(publicKey);
				publicKeyBytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					publicKeyBytes[i] = binaryString.charCodeAt(i);
				}
				decodingMethod = 'base64-fallback';
				DEBUG && console.log('🔍 DEBUG: Successfully decoded as base64 (fallback)');
			} catch (base64Error) {
				lastError += `Base64: ${base64Error.message}; `;
				try {
					publicKeyBytes = base64url2buf(publicKey);
					decodingMethod = 'base64url-fallback';
					DEBUG && console.log('🔍 DEBUG: Successfully decoded as base64url (fallback)');
				} catch (base64urlError) {
					lastError += `Base64URL: ${base64urlError.message}`;
					throw new Error(`Public key decoding failed - ${lastError}`);
				}
			}
		}

		// Validate decoded bytes
		if (publicKeyBytes.length !== 65 && publicKeyBytes.length !== 32) {
			throw new Error(
				`Invalid public key length: expected 32 or 65 bytes, got ${publicKeyBytes.length} bytes. ` +
					`This suggests the wrong decoding method was used (${decodingMethod}).`
			);
		}

		DEBUG &&
			console.log('🔍 DEBUG: Public key decoding completed:', {
				decodingMethod,
				publicKeyBytesLength: publicKeyBytes.length,
				publicKeyBytesPreview: Array.from(publicKeyBytes.slice(0, 8)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				),
				isValidLength: publicKeyBytes.length === 65 || publicKeyBytes.length === 32
			});

		// Handle different public key formats
		let xCoordinate: BigInt;

		if (publicKeyBytes.length === 65) {
			// Uncompressed format: 0x04 + 32-byte X + 32-byte Y
			if (publicKeyBytes[0] !== 0x04) {
				throw new Error(
					`Invalid uncompressed public key format: expected first byte 0x04, got 0x${publicKeyBytes[0].toString(16)}`
				);
			}

			// Extract X-coordinate (bytes 1-32, skip the 0x04 prefix)
			const xBytes = publicKeyBytes.slice(1, 33);
			xCoordinate = BigInt(
				'0x' +
					Array.from(xBytes)
						.map((b) => b.toString(16).padStart(2, '0'))
						.join('')
			);

			DEBUG &&
				console.log('🔍 DEBUG: Uncompressed public key format detected:', {
					totalBytes: publicKeyBytes.length,
					prefix: '0x' + publicKeyBytes[0].toString(16),
					xBytesLength: xBytes.length,
					xCoordinate: xCoordinate.toString(16),
					xCoordinatePreview: xCoordinate.toString(16).slice(0, 20) + '...'
				});
		} else if (publicKeyBytes.length === 32) {
			// Compressed format: just the X-coordinate (legacy)
			xCoordinate = BigInt(
				'0x' +
					Array.from(publicKeyBytes)
						.map((b) => b.toString(16).padStart(2, '0'))
						.join('')
			);

			DEBUG &&
				console.log('🔍 DEBUG: Compressed public key format detected:', {
					xBytesLength: publicKeyBytes.length,
					xCoordinate: xCoordinate.toString(16),
					xCoordinatePreview: xCoordinate.toString(16).slice(0, 20) + '...'
				});
		} else {
			throw new Error(
				`Unexpected public key length: ${publicKeyBytes.length} bytes. Expected 32 (compressed) or 65 (uncompressed) bytes.`
			);
		}

		// Create secp256r1 signature object
		const ecdsaSignature = new secp256r1.Signature(r, s);

		// Try both possible y-coordinates (even and odd parity)
		for (const recovery of [0, 1]) {
			try {
				const recoveredPoint = ecdsaSignature
					.addRecoveryBit(recovery)
					.recoverPublicKey(messageHash);

				DEBUG &&
					console.log(`🔍 DEBUG: Recovery attempt ${recovery}:`, {
						recoveredX: recoveredPoint.x.toString(16),
						recoveredXPreview: recoveredPoint.x.toString(16).slice(0, 20) + '...',
						storedX: xCoordinate.toString(16),
						storedXPreview: xCoordinate.toString(16).slice(0, 20) + '...',
						xCoordinatesMatch: recoveredPoint.x === xCoordinate
					});

				// Check if the recovered public key matches our stored x coordinate
				if (recoveredPoint.x === xCoordinate) {
					// Verify the signature with the recovered public key (convert point to proper format)
					const isValid = secp256r1.verify(
						ecdsaSignature,
						messageHash,
						recoveredPoint.toRawBytes()
					);

					if (isValid) {
						// Optional: Verify challenge if provided
						if (challenge) {
							const clientData = JSON.parse(new TextDecoder().decode(clientDataJSONBytes));
							if (clientData.challenge !== challenge) {
								return {
									success: false,
									error: 'Challenge mismatch',
									details: {
										expectedChallenge: challenge,
										receivedChallenge: clientData.challenge
									}
								};
							}
						}

						DEBUG &&
							console.log('🔍 DEBUG: Signature verification succeeded:', {
								decodingMethod,
								recovery,
								publicKeyFormat: {
									isBase64url: /^[A-Za-z0-9_-]+$/.test(publicKey),
									hasBase64Chars: /[+/]/.test(publicKey),
									length: publicKey.length
								}
							});

						return {
							success: true,
							details: {
								decodingMethod,
								recovery,
								r: r.toString(16),
								s: s.toString(16),
								messageHash: Array.from(messageHash)
									.map((b) => b.toString(16).padStart(2, '0'))
									.join(''),
								publicKeyX: xCoordinate.toString(16),
								publicKeyFormat: {
									isBase64url: /^[A-Za-z0-9_-]+$/.test(publicKey),
									hasBase64Chars: /[+/]/.test(publicKey)
								}
							}
						};
					}
				}
			} catch (recoveryError) {
				// Continue to try the other recovery bit
				continue;
			}
		}

		DEBUG &&
			console.log('🔍 DEBUG: Signature verification failed - detailed info:', {
				decodingMethod,
				publicKeyFormat: {
					length: publicKey.length,
					preview: publicKey.slice(0, 20) + '...',
					isBase64url: /^[A-Za-z0-9_-]+$/.test(publicKey),
					hasBase64Chars: /[+/]/.test(publicKey)
				},
				publicKeyBytes: {
					length: publicKeyBytes.length,
					first8Bytes: Array.from(publicKeyBytes.slice(0, 8)).map(
						(b) => '0x' + b.toString(16).padStart(2, '0')
					)
				},
				signature: {
					r: r.toString(16),
					s: s.toString(16)
				},
				messageHash: Array.from(messageHash)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join(''),
				publicKeyX: xCoordinate.toString(16),
				attempts: 'Tried both recovery bits (0 and 1)'
			});

		return {
			success: false,
			error: 'Signature verification failed - no valid recovery found',
			details: {
				decodingMethod,
				r: r.toString(16),
				s: s.toString(16),
				messageHash: Array.from(messageHash)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join(''),
				publicKeyX: xCoordinate.toString(16),
				attempts: 'Tried both recovery bits (0 and 1)',
				publicKeyFormat: {
					isBase64url: /^[A-Za-z0-9_-]+$/.test(publicKey),
					hasBase64Chars: /[+/]/.test(publicKey),
					length: publicKey.length
				}
			}
		};
	} catch (error) {
		return {
			success: false,
			error: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
			details: {
				errorName: error instanceof Error ? error.name : 'UnknownError',
				errorStack: error instanceof Error ? error.stack : undefined
			}
		};
	}
}

/**
 * Validate basic WebAuthn assertion structure
 */
export function validateWebAuthnAssertion({
	credentialId,
	signature,
	authenticatorData,
	clientDataJSON
}: {
	credentialId: string;
	signature: string;
	authenticatorData: string;
	clientDataJSON: string;
}): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Check credential ID format (should be base64)
	if (!/^[A-Za-z0-9+/]+=*$/.test(credentialId)) {
		errors.push('Invalid credential ID format - must be base64');
	}

	// Check signature format (should be hex, with optional 0x prefix)
	if (!/^(0x)?[0-9a-fA-F]+$/.test(signature)) {
		errors.push('Invalid signature format - must be hex');
	}

	// Check authenticator data format (should be hex, with optional 0x prefix)
	if (!/^(0x)?[0-9a-fA-F]+$/.test(authenticatorData)) {
		errors.push('Invalid authenticator data format - must be hex');
	}

	// Check client data JSON format (should be hex, with optional 0x prefix)
	if (!/^(0x)?[0-9a-fA-F]+$/.test(clientDataJSON)) {
		errors.push('Invalid client data JSON format - must be hex');
	}

	// Validate hex string lengths are even (accounting for optional 0x prefix)
	const getHexLength = (str: string) => (str.startsWith('0x') ? str.length - 2 : str.length);

	if (getHexLength(signature) % 2 !== 0) {
		errors.push('Signature hex string must have even length');
	}

	if (getHexLength(authenticatorData) % 2 !== 0) {
		errors.push('Authenticator data hex string must have even length');
	}

	if (getHexLength(clientDataJSON) % 2 !== 0) {
		errors.push('Client data JSON hex string must have even length');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
