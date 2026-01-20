import { describe, it, expect, beforeEach } from 'vitest';

// Mock the exact data from the logs
const MOCK_WEBAUTHN_DATA = {
	base64PublicKey:
		'BFBJhU4/labNOIOYWk58iftumxaAbXlTbmR6GM1SOFyqyDahRDFiuvzRa15yH1cnOR1XAuty5WT7mNdBY/F8tWY=',
	expectedLength: 88,
	expectedDecodedLength: 65,
	expectedFirstBytes: [
		'0x04',
		'0x50',
		'0x49',
		'0x85',
		'0x4e',
		'0x3f',
		'0x95',
		'0xa6',
		'0xcd',
		'0x38'
	]
};

// Test class to isolate the WebAuthn to Starknet logic
class WebAuthnStarknetTest {
	/**
	 * Test the base64 decoding logic that was failing
	 */
	testBase64Decoding() {
		console.log('🧪 Testing base64 decoding...');

		try {
			// Use atob() instead of Buffer.from() to avoid corruption issues
			const pubkeyString = MOCK_WEBAUTHN_DATA.base64PublicKey;
			const binaryString = atob(pubkeyString);
			const publicKeyBytes = new Uint8Array(binaryString.length);

			for (let i = 0; i < binaryString.length; i++) {
				publicKeyBytes[i] = binaryString.charCodeAt(i);
			}

			console.log('✅ Base64 decoding successful:', {
				originalBase64: pubkeyString.substring(0, 20) + '...',
				binaryStringLength: binaryString.length,
				publicKeyBytesLength: publicKeyBytes.length,
				firstBytes: Array.from(publicKeyBytes.slice(0, 10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				)
			});

			// Verify the results
			expect(publicKeyBytes.length).toBe(MOCK_WEBAUTHN_DATA.expectedDecodedLength);
			expect(publicKeyBytes[0]).toBe(0x04); // Should start with 0x04

			return publicKeyBytes;
		} catch (error) {
			console.error('❌ Base64 decoding failed:', error);
			throw error;
		}
	}

	/**
	 * Test the x-coordinate extraction logic
	 */
	testXCoordinateExtraction(publicKeyBytes: Uint8Array) {
		console.log('🧪 Testing x-coordinate extraction...');

		try {
			if (publicKeyBytes.length === 65) {
				// Standard format: 0x04 + 32 bytes (x) + 32 bytes (y)
				// Skip the first byte (0x04) and take the next 32 bytes (x coordinate)
				console.log('🔍 DEBUG: Using 65-byte format, extracting x-coordinate');
				const xCoordinate = publicKeyBytes.slice(1, 33);

				console.log('🔍 DEBUG: Extracted x-coordinate:', {
					length: xCoordinate.length,
					firstBytes: Array.from(xCoordinate.slice(0, 10)).map(
						(b) => '0x' + b.toString(16).padStart(2, '0')
					),
					lastBytes: Array.from(xCoordinate.slice(-10)).map(
						(b) => '0x' + b.toString(16).padStart(2, '0')
					)
				});

				// Verify the results
				expect(xCoordinate.length).toBe(32);
				expect(xCoordinate[0]).toBe(0x50); // First byte of x-coordinate
				expect(xCoordinate[31]).toBe(0x42); // Last byte of x-coordinate

				return Buffer.from(xCoordinate);
			} else {
				throw new Error(
					`Invalid public key length: expected 65 bytes, got ${publicKeyBytes.length}`
				);
			}
		} catch (error) {
			console.error('❌ X-coordinate extraction failed:', error);
			throw error;
		}
	}

	/**
	 * Test the hex string generation logic
	 */
	testHexStringGeneration(xCoordinate: Buffer) {
		console.log('🧪 Testing hex string generation...');

		try {
			// Convert Buffer to Uint8Array and then to hex string for the contract call
			const xCoordinateArray = new Uint8Array(xCoordinate);
			const publicKeyHex =
				'0x' +
				Array.from(xCoordinateArray)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');

			console.log('✅ Hex string generation successful:', {
				xCoordinateLength: xCoordinateArray.length,
				xCoordinateBytes: Array.from(xCoordinateArray.slice(0, 10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				),
				publicKeyHex,
				publicKeyHexLength: publicKeyHex.length
			});

			// Verify the results
			expect(publicKeyHex).toMatch(/^0x[0-9a-f]{64}$/); // Should be 0x + 64 hex chars
			expect(publicKeyHex.length).toBe(66); // 0x + 64 hex chars

			return publicKeyHex;
		} catch (error) {
			console.error('❌ Hex string generation failed:', error);
			throw error;
		}
	}

	/**
	 * Test the complete flow
	 */
	testCompleteFlow() {
		console.log('🧪 Testing complete WebAuthn to Starknet flow...');

		try {
			// Step 1: Base64 decoding
			const publicKeyBytes = this.testBase64Decoding();

			// Step 2: X-coordinate extraction
			const xCoordinate = this.testXCoordinateExtraction(publicKeyBytes);

			// Step 3: Hex string generation
			const publicKeyHex = this.testHexStringGeneration(xCoordinate);

			console.log('🎉 Complete flow test successful!');
			console.log('Final public key hex:', publicKeyHex);

			return {
				publicKeyBytes,
				xCoordinate,
				publicKeyHex
			};
		} catch (error) {
			console.error('❌ Complete flow test failed:', error);
			throw error;
		}
	}

	/**
	 * Test the exact error scenario from the logs
	 */
	testErrorScenario() {
		console.log('🧪 Testing the exact error scenario...');

		try {
			// Simulate the exact call that was failing
			const pubkeyString = MOCK_WEBAUTHN_DATA.base64PublicKey;
			const binaryString = atob(pubkeyString);
			const publicKeyBytes = new Uint8Array(binaryString.length);

			for (let i = 0; i < binaryString.length; i++) {
				publicKeyBytes[i] = binaryString.charCodeAt(i);
			}

			console.log('🔍 DEBUG: Before extractXCoordinate call:', {
				publicKeyBytesType: typeof publicKeyBytes,
				publicKeyBytesConstructor: publicKeyBytes?.constructor?.name,
				publicKeyBytesLength: publicKeyBytes?.length,
				publicKeyBytesFirstBytes: publicKeyBytes
					? Array.from(publicKeyBytes.slice(0, 10)).map(
							(b) => '0x' + b.toString(16).padStart(2, '0')
						)
					: 'undefined'
			});

			// This should not throw an error
			const xCoordinate = this.extractXCoordinate(publicKeyBytes);

			console.log('✅ Error scenario test passed!');
			return xCoordinate;
		} catch (error) {
			console.error('❌ Error scenario test failed:', error);
			throw error;
		}
	}

	/**
	 * Mock extractXCoordinate method to test the exact logic
	 */
	private extractXCoordinate(publicKeyBytes: Uint8Array): Buffer {
		if (publicKeyBytes.length === 65) {
			// Standard format: 0x04 + 32 bytes (x) + 32 bytes (y)
			// Skip the first byte (0x04) and take the next 32 bytes (x coordinate)
			console.log('🔍 DEBUG: Using 65-byte format, extracting x-coordinate');
			const xCoordinate = publicKeyBytes.slice(1, 33);

			console.log('🔍 DEBUG: Extracted x-coordinate:', {
				length: xCoordinate.length,
				firstBytes: Array.from(xCoordinate.slice(0, 10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				),
				lastBytes: Array.from(xCoordinate.slice(-10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				)
			});

			return Buffer.from(xCoordinate);
		} else {
			throw new Error(`Invalid public key format: expected 65 bytes, got ${publicKeyBytes.length}`);
		}
	}
}

// Test suite
describe('WebAuthn to Starknet Integration', () => {
	let testInstance: WebAuthnStarknetTest;

	beforeEach(() => {
		testInstance = new WebAuthnStarknetTest();
	});

	it('should decode base64 public key correctly', () => {
		const result = testInstance.testBase64Decoding();
		expect(result).toBeDefined();
		expect(result.length).toBe(65);
	});

	it('should extract x-coordinate correctly', () => {
		const publicKeyBytes = testInstance.testBase64Decoding();
		const result = testInstance.testXCoordinateExtraction(publicKeyBytes);
		expect(result).toBeDefined();
		expect(result.length).toBe(32);
	});

	it('should generate hex string correctly', () => {
		const publicKeyBytes = testInstance.testBase64Decoding();
		const xCoordinate = testInstance.testXCoordinateExtraction(publicKeyBytes);
		const result = testInstance.testHexStringGeneration(xCoordinate);
		expect(result).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it('should complete the full flow successfully', () => {
		const result = testInstance.testCompleteFlow();
		expect(result).toBeDefined();
		expect(result.publicKeyHex).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it('should handle the error scenario without throwing', () => {
		const result = testInstance.testErrorScenario();
		expect(result).toBeDefined();
		expect(result.length).toBe(32);
	});
});
