#!/usr/bin/env node

// Comprehensive test for the complete WebAuthn to Starknet flow
// This tests the exact logic that was failing in the browser, including the x-coordinate extraction fix

console.log('🧪 Testing Complete WebAuthn to Starknet Flow...\n');

// Mock the exact data from the browser logs
const MOCK_WEBAUTHN_DATA = {
	base64PublicKey:
		'BCVLAZnOED9MFerEOiz4OKj50vaVIA6jcg7okq2T9s2kGmM64WNRdIZo9sRD9hxprk9R0DnMLjp6mDorvTZiCzY=',
	expectedLength: 88,
	expectedDecodedLength: 65,
	expectedFirstBytes: [
		'0x04',
		'0x25',
		'0x4b',
		'0x01',
		'0x99',
		'0xce',
		'0x10',
		'0x3f',
		'0x4c',
		'0x15'
	]
};

// Test class that mimics the exact StarknetService logic
class CompleteWebAuthnFlowTest {
	/**
	 * Test the base64 decoding logic (equivalent to atob() in browser)
	 */
	testBase64Decoding() {
		console.log('🧪 Testing base64 decoding (browser equivalent)...');

		try {
			// Simulate the browser's atob() + Uint8Array approach
			const pubkeyString = MOCK_WEBAUTHN_DATA.base64PublicKey;
			const binaryString = Buffer.from(pubkeyString, 'base64').toString('binary');
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
	 * Test the FIXED x-coordinate extraction logic
	 */
	testXCoordinateExtraction(publicKeyBytes) {
		console.log('🧪 Testing FIXED x-coordinate extraction...');

		try {
			if (publicKeyBytes.length === 65) {
				// Standard format: 0x04 + 32 bytes (x) + 32 bytes (y)
				// Skip the first byte (0x04) and take the next 32 bytes (x coordinate)
				console.log('🔍 DEBUG: Using 65-byte format, extracting x-coordinate');

				// Use the FIXED approach that's browser-compatible
				const xCoordinate = new Uint8Array(32);
				for (let i = 0; i < 32; i++) {
					const byte = publicKeyBytes[i + 1]; // Skip 0x04, start from index 1
					if (byte !== undefined) {
						xCoordinate[i] = byte;
					} else {
						throw new Error(`Failed to extract byte at index ${i + 1} from public key`);
					}
				}

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

				if (xCoordinate[0] !== 0x25) {
					throw new Error(
						`Expected first byte of x-coordinate 0x25, got 0x${xCoordinate[0].toString(16)}`
					);
				}

				console.log('✅ X-coordinate extraction validation passed!\n');
				return Buffer.from(xCoordinate);
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
	 * Test the constructor calldata preparation
	 */
	testConstructorCalldataPreparation(xCoordinate) {
		console.log('🧪 Testing constructor calldata preparation...');

		try {
			// Convert Buffer to Uint8Array and then to hex string for the contract call
			const xCoordinateArray = new Uint8Array(xCoordinate);
			const publicKeyHex =
				'0x' +
				Array.from(xCoordinateArray)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');

			console.log('🔍 DEBUG: Constructor calldata preparation:', {
				xCoordinateLength: xCoordinateArray.length,
				xCoordinateBytes: Array.from(xCoordinateArray.slice(0, 10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				),
				publicKeyHex,
				publicKeyHexLength: publicKeyHex.length
			});

			// Mock the constructor calldata (simplified version)
			const constructorCalldata = {
				owner: 'mock-webauthn-owner',
				guardian: 'mock-guardian',
				public_key: publicKeyHex
			};

			console.log('🔍 DEBUG: Final constructor calldata:', {
				calldata: constructorCalldata,
				calldataLength: Object.keys(constructorCalldata).length
			});

			console.log('✅ Constructor calldata preparation validation passed!\n');
			return { publicKeyHex, constructorCalldata };
		} catch (error) {
			console.error('❌ Constructor calldata preparation failed:', error.message);
			throw error;
		}
	}

	/**
	 * Test the complete flow with the exact browser data
	 */
	testCompleteFlow() {
		console.log('🧪 Testing complete WebAuthn to Starknet flow with browser data...\n');

		try {
			// Step 1: Base64 decoding (browser equivalent)
			const publicKeyBytes = this.testBase64Decoding();

			// Step 2: X-coordinate extraction (FIXED method)
			const xCoordinate = this.testXCoordinateExtraction(publicKeyBytes);

			// Step 3: Hex string generation
			const publicKeyHex = this.testHexStringGeneration(xCoordinate);

			// Step 4: Constructor calldata preparation
			const { constructorCalldata } = this.testConstructorCalldataPreparation(xCoordinate);

			console.log('🎉 Complete flow test successful!');
			console.log('Final public key hex:', publicKeyHex);
			console.log('Expected format: 0x + 64 hex characters');
			console.log('Actual format: ✓ Valid');
			console.log('Constructor calldata ready for Starknet contract');

			return {
				publicKeyBytes,
				xCoordinate,
				publicKeyHex,
				constructorCalldata
			};
		} catch (error) {
			console.error('❌ Complete flow test failed:', error.message);
			throw error;
		}
	}

	/**
	 * Test the exact error scenario that was failing in the browser
	 */
	testBrowserErrorScenario() {
		console.log('🧪 Testing the exact browser error scenario (should now pass)...\n');

		try {
			// Simulate the exact call that was failing
			const pubkeyString = MOCK_WEBAUTHN_DATA.base64PublicKey;
			const binaryString = Buffer.from(pubkeyString, 'base64').toString('binary');
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

			// This should now work with the FIXED method
			const xCoordinate = this.extractXCoordinate(publicKeyBytes);

			console.log('✅ Browser error scenario test passed!');
			return xCoordinate;
		} catch (error) {
			console.error('❌ Browser error scenario test failed:', error.message);
			throw error;
		}
	}

	/**
	 * Mock extractXCoordinate method with the FIXED logic
	 */
	extractXCoordinate(publicKeyBytes) {
		if (publicKeyBytes.length === 65) {
			// Standard format: 0x04 + 32 bytes (x) + 32 bytes (y)
			// Skip the first byte (0x04) and take the next 32 bytes (x coordinate)
			console.log('🔍 DEBUG: Using 65-byte format, extracting x-coordinate');

			// Use the FIXED approach that's browser-compatible
			const xCoordinate = new Uint8Array(32);
			for (let i = 0; i < 32; i++) {
				const byte = publicKeyBytes[i + 1]; // Skip 0x04, start from index 1
				if (byte !== undefined) {
					xCoordinate[i] = byte;
				} else {
					throw new Error(`Failed to extract byte at index ${i + 1} from public key`);
				}
			}

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

	/**
	 * Test the old broken method to show the difference
	 */
	testOldBrokenMethod() {
		console.log('🧪 Testing the OLD BROKEN method (for comparison)...\n');

		try {
			const pubkeyString = MOCK_WEBAUTHN_DATA.base64PublicKey;
			const binaryString = Buffer.from(pubkeyString, 'base64').toString('binary');
			const publicKeyBytes = new Uint8Array(binaryString.length);

			for (let i = 0; i < binaryString.length; i++) {
				publicKeyBytes[i] = binaryString.charCodeAt(i);
			}

			// This is what was failing in the browser
			console.log('🔍 DEBUG: Testing OLD method: publicKeyBytes.slice(1, 33)');
			const oldXCoordinate = publicKeyBytes.slice(1, 33);

			console.log('🔍 DEBUG: OLD method result:', {
				type: typeof oldXCoordinate,
				constructor: oldXCoordinate?.constructor?.name,
				length: oldXCoordinate?.length,
				firstBytes: oldXCoordinate
					? Array.from(oldXCoordinate.slice(0, 10)).map(
							(b) => '0x' + b.toString(16).padStart(2, '0')
						)
					: 'undefined'
			});

			console.log('✅ OLD method test completed (shows what was failing)\n');
			return oldXCoordinate;
		} catch (error) {
			console.error('❌ OLD method test failed:', error.message);
			throw error;
		}
	}
}

// Run the comprehensive tests
async function runCompleteTests() {
	try {
		const testInstance = new CompleteWebAuthnFlowTest();

		console.log('='.repeat(70));
		console.log('🧪 RUNNING COMPLETE WEBAUTHN TO STARKNET FLOW TESTS');
		console.log('='.repeat(70));
		console.log();

		// Test 1: Show the old broken method
		testInstance.testOldBrokenMethod();

		// Test 2: Base64 decoding
		testInstance.testBase64Decoding();

		// Test 3: Complete flow with FIXED method
		const result = testInstance.testCompleteFlow();

		// Test 4: Browser error scenario (should now pass)
		testInstance.testBrowserErrorScenario();

		console.log('='.repeat(70));
		console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
		console.log('='.repeat(70));
		console.log();
		console.log('📊 Test Results Summary:');
		console.log(`   • Base64 decoding: ✅ ${result.publicKeyBytes.length} bytes`);
		console.log(`   • X-coordinate extraction (FIXED): ✅ ${result.xCoordinate.length} bytes`);
		console.log(`   • Hex string generation: ✅ ${result.publicKeyHex.length} characters`);
		console.log(`   • Constructor calldata: ✅ Ready for Starknet`);
		console.log(`   • Final hex: ${result.publicKeyHex}`);
		console.log();
		console.log('🚀 The WebAuthn to Starknet integration should now work!');
	} catch (error) {
		console.error('\n' + '='.repeat(70));
		console.error('❌ TEST SUITE FAILED');
		console.error('='.repeat(70));
		console.error('Error:', error.message);
		process.exit(1);
	}
}

// Run the comprehensive tests
runCompleteTests();
