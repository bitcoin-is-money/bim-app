#!/usr/bin/env node

// Simple test script to isolate the WebAuthn to Starknet logic
// This tests the exact logic that's failing in the browser

console.log('🧪 Testing WebAuthn to Starknet Integration Logic...\n');

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
			// Use Buffer.from() for Node.js (equivalent to atob() in browser)
			const pubkeyString = MOCK_WEBAUTHN_DATA.base64PublicKey;
			const publicKeyBytes = Buffer.from(pubkeyString, 'base64');

			console.log('✅ Base64 decoding successful:', {
				originalBase64: pubkeyString.substring(0, 20) + '...',
				publicKeyBytesLength: publicKeyBytes.length,
				firstBytes: Array.from(publicKeyBytes.slice(0, 10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				)
			});

			// Verify the results
			if (publicKeyBytes.length !== MOCK_WEBAUTHN_DATA.expectedDecodedLength) {
				throw new Error(
					`Expected length ${MOCK_WEBAUTHN_DATA.expectedDecodedLength}, got ${publicKeyBytes.length}`
				);
			}

			if (publicKeyBytes[0] !== 0x04) {
				throw new Error(`Expected first byte 0x04, got 0x${publicKeyBytes[0].toString(16)}`);
			}

			console.log('✅ Base64 decoding validation passed!\n');
			return publicKeyBytes;
		} catch (error) {
			console.error('❌ Base64 decoding failed:', error.message);
			throw error;
		}
	}

	/**
	 * Test the x-coordinate extraction logic
	 */
	testXCoordinateExtraction(publicKeyBytes) {
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
				if (xCoordinate.length !== 32) {
					throw new Error(`Expected x-coordinate length 32, got ${xCoordinate.length}`);
				}

				if (xCoordinate[0] !== 0x50) {
					throw new Error(
						`Expected first byte of x-coordinate 0x50, got 0x${xCoordinate[0].toString(16)}`
					);
				}

				console.log('✅ X-coordinate extraction validation passed!\n');
				return xCoordinate;
			} else {
				throw new Error(
					`Invalid public key length: expected 65 bytes, got ${publicKeyBytes.length}`
				);
			}
		} catch (error) {
			console.error('❌ X-coordinate extraction failed:', error.message);
			throw error;
		}
	}

	/**
	 * Test the hex string generation logic
	 */
	testHexStringGeneration(xCoordinate) {
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
			if (!publicKeyHex.match(/^0x[0-9a-f]{64}$/)) {
				throw new Error(`Invalid hex format: ${publicKeyHex}`);
			}

			if (publicKeyHex.length !== 66) {
				throw new Error(`Expected hex length 66 (0x + 64 chars), got ${publicKeyHex.length}`);
			}

			console.log('✅ Hex string generation validation passed!\n');
			return publicKeyHex;
		} catch (error) {
			console.error('❌ Hex string generation failed:', error.message);
			throw error;
		}
	}

	/**
	 * Test the complete flow
	 */
	testCompleteFlow() {
		console.log('🧪 Testing complete WebAuthn to Starknet flow...\n');

		try {
			// Step 1: Base64 decoding
			const publicKeyBytes = this.testBase64Decoding();

			// Step 2: X-coordinate extraction
			const xCoordinate = this.testXCoordinateExtraction(publicKeyBytes);

			// Step 3: Hex string generation
			const publicKeyHex = this.testHexStringGeneration(xCoordinate);

			console.log('🎉 Complete flow test successful!');
			console.log('Final public key hex:', publicKeyHex);
			console.log('Expected format: 0x + 64 hex characters');
			console.log('Actual format: ✓ Valid');

			return {
				publicKeyBytes,
				xCoordinate,
				publicKeyHex
			};
		} catch (error) {
			console.error('❌ Complete flow test failed:', error.message);
			throw error;
		}
	}

	/**
	 * Test the exact error scenario from the logs
	 */
	testErrorScenario() {
		console.log('🧪 Testing the exact error scenario...\n');

		try {
			// Simulate the exact call that was failing
			const pubkeyString = MOCK_WEBAUTHN_DATA.base64PublicKey;
			const publicKeyBytes = Buffer.from(pubkeyString, 'base64');

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
			console.error('❌ Error scenario test failed:', error.message);
			throw error;
		}
	}

	/**
	 * Mock extractXCoordinate method to test the exact logic
	 */
	extractXCoordinate(publicKeyBytes) {
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

			return xCoordinate;
		} else {
			throw new Error(`Invalid public key format: expected 65 bytes, got ${publicKeyBytes.length}`);
		}
	}
}

// Run the tests
async function runTests() {
	try {
		const testInstance = new WebAuthnStarknetTest();

		console.log('='.repeat(60));
		console.log('🧪 RUNNING WEBAUTHN TO STARKNET INTEGRATION TESTS');
		console.log('='.repeat(60));
		console.log();

		// Test 1: Base64 decoding
		testInstance.testBase64Decoding();

		// Test 2: Complete flow
		const result = testInstance.testCompleteFlow();

		// Test 3: Error scenario
		testInstance.testErrorScenario();

		console.log('='.repeat(60));
		console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
		console.log('='.repeat(60));
		console.log();
		console.log('📊 Test Results Summary:');
		console.log(`   • Base64 decoding: ✅ ${result.publicKeyBytes.length} bytes`);
		console.log(`   • X-coordinate extraction: ✅ ${result.xCoordinate.length} bytes`);
		console.log(`   • Hex string generation: ✅ ${result.publicKeyHex.length} characters`);
		console.log(`   • Final hex: ${result.publicKeyHex}`);
	} catch (error) {
		console.error('\n' + '='.repeat(60));
		console.error('❌ TEST SUITE FAILED');
		console.error('='.repeat(60));
		console.error('Error:', error.message);
		process.exit(1);
	}
}

// Run the tests
runTests();
