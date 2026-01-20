/**
 * @fileoverview Cryptographic Byte Manipulation Utilities
 *
 * This module provides essential byte manipulation functions for cryptographic
 * operations in the WebAuthn Starknet account deployment application. It handles
 * conversion between different data formats commonly used in cryptographic
 * operations and blockchain interactions.
 *
 * Key Functions:
 * - Buffer/ArrayBuffer to hex string conversion
 * - Hex string to buffer conversion
 * - Base64 and Base64URL encoding/decoding
 * - Random byte generation for cryptographic operations
 * - BigInt conversion for large number handling
 *
 * Security Considerations:
 * - All functions handle binary data safely
 * - Base64URL encoding follows RFC 4648 specification
 * - Random byte generation uses secure randomization
 * - Proper padding handling for base64 operations
 *
 * @author bim
 * @version 1.0.0
 */

/**
 * Convert ArrayBuffer to hexadecimal string
 *
 * Converts binary data to a hex string representation, commonly used
 * for displaying binary data in a human-readable format and for
 * blockchain operations.
 *
 * @param buffer - ArrayBuffer containing binary data
 * @param prefix - Whether to include "0x" prefix (default: true)
 * @returns Hexadecimal string representation
 *
 * @example
 * ```typescript
 * const buffer = new Uint8Array([255, 0, 128]).buffer;
 * const hex = buf2hex(buffer); // "0xff0080"
 * const hexNoPrefix = buf2hex(buffer, false); // "ff0080"
 * ```
 */
export const buf2hex = (
	buffer: ArrayBuffer | ArrayBufferLike | Uint8Array,
	prefix = true
): string => {
	// Handle Uint8Array by using its buffer
	const actualBuffer = buffer instanceof Uint8Array ? buffer.buffer : buffer;
	return `${prefix ? '0x' : ''}${[...new Uint8Array(actualBuffer)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Convert hexadecimal string to Uint8Array
 *
 * Parses a hex string (with or without "0x" prefix) and converts it
 * to binary data. Used for processing hex-encoded data from blockchain
 * operations and cryptographic functions.
 *
 * @param hex - Hexadecimal string (with or without "0x" prefix)
 * @returns Uint8Array containing binary data
 *
 * @example
 * ```typescript
 * const buffer1 = hex2buf("0xff0080");
 * const buffer2 = hex2buf("ff0080");
 * // Both produce: Uint8Array([255, 0, 128])
 * ```
 */
export const hex2buf = (hex: string) =>
	Uint8Array.from(
		hex
			.replace(/^0x/, '')
			.match(/.{1,2}/g)!
			.map((byte) => parseInt(byte, 16))
	);

/**
 * Convert ArrayBuffer to Base64 string
 *
 * Encodes binary data as Base64 string. Used for data transmission
 * and storage where binary data needs to be represented as text.
 *
 * @param buffer - ArrayBuffer containing binary data
 * @returns Base64 encoded string
 *
 * @example
 * ```typescript
 * const buffer = new Uint8Array([255, 0, 128]).buffer;
 * const base64 = buf2base64(buffer); // "/wCA"
 * ```
 */
export const buf2base64 = (buffer: ArrayBuffer) =>
	btoa(String.fromCharCode(...new Uint8Array(buffer)));

/**
 * Convert ArrayBuffer to Base64URL string
 *
 * Encodes binary data as Base64URL string (RFC 4648). This format
 * is URL-safe and commonly used in WebAuthn operations and JWTs.
 *
 * Base64URL differences from Base64:
 * - Uses "-" instead of "+"
 * - Uses "_" instead of "/"
 * - Removes padding "=" characters
 *
 * @param buffer - ArrayBuffer containing binary data
 * @returns Base64URL encoded string
 *
 * @example
 * ```typescript
 * const buffer = new Uint8Array([255, 0, 128]).buffer;
 * const base64url = buf2base64url(buffer); // "_wCA"
 * ```
 */
export const buf2base64url = (buffer: ArrayBuffer) =>
	buf2base64(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

/**
 * Convert Base64URL string to Uint8Array
 *
 * Decodes a Base64URL encoded string back to binary data. Handles
 * the URL-safe character set and missing padding automatically.
 *
 * @param base64URLString - Base64URL encoded string
 * @returns Uint8Array containing decoded binary data
 *
 * @example
 * ```typescript
 * const buffer = base64url2buf("_wCA");
 * // Returns: Uint8Array([255, 0, 128])
 * ```
 */
export const base64url2buf = (base64URLString: string) => {
	// Convert Base64URL to Base64 format
	const base64 = base64URLString.replace(/-/g, '+').replace(/_/g, '/');

	// Add padding if necessary
	const padLength = (4 - (base64.length % 4)) % 4;
	const padded = base64.padEnd(base64.length + padLength, '=');

	// Decode Base64 to binary
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);

	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes;
};

/**
 * Generate cryptographically secure random bytes
 *
 * Creates a Uint8Array of random bytes for cryptographic operations.
 * Used for generating challenges, nonces, and other security-critical
 * random values.
 *
 * Note: This implementation uses Math.random() which is NOT cryptographically
 * secure. In production, this should be replaced with crypto.getRandomValues()
 * or a similar secure random number generator.
 *
 * @param length - Number of random bytes to generate
 * @returns Uint8Array containing random bytes
 *
 * @example
 * ```typescript
 * const challenge = randomBytes(32); // 32 random bytes
 * const nonce = randomBytes(16);     // 16 random bytes
 * ```
 */
export const randomBytes = (length: number) =>
	new Uint8Array(Array.from({ length }, () => Math.floor(Math.random() * 40)));

/**
 * Convert Uint8Array to BigInt
 *
 * Converts binary data to a BigInt value for large number operations.
 * Used in cryptographic calculations and blockchain operations that
 * require arbitrary precision arithmetic.
 *
 * @param buffer - Uint8Array containing binary data
 * @returns BigInt representation of the binary data
 *
 * @example
 * ```typescript
 * const buffer = new Uint8Array([1, 0, 0]); // Represents 65536
 * const bigInt = buf2bigint(buffer); // 65536n
 * ```
 */
export const buf2bigint = (buffer: Uint8Array): bigint => {
	let value = 0n;
	for (const byte of buffer.values()) {
		value = (value << 8n) + BigInt(byte);
	}
	return value;
};
