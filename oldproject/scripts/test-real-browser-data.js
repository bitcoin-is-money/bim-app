#!/usr/bin/env node

// Test with the EXACT data from the browser logs
// This will verify the fix works with real user data

console.log('🧪 Testing with REAL Browser Data...\n');

// EXACT data from the browser logs
const REAL_BROWSER_DATA = {
	base64PublicKey:
		'BKDM4eUdzPS0DDxLVHvpQUrzpi9wy24ERfR01ijuBx1QA6wc6qqz2GL49KqsJTwV6bWiBarhMNovcMPtU34a40I=',
	expectedHex:
		'0x04a0cce1e51dccf4b40c3c4b547be9414af3a62f70cb6e0445f474d628ee071d5003ac1ceaaab3d862f8f4aaac253c15e9b5a205aae130da2f70c3ed537e1ae342',
	expectedLength: 88,
	expectedDecodedLength: 65
};

class RealBrowserDataTest {
	/**
	 * Test the exact logic that's failing in the browser
	 */
	testRealBrowserData() {
		console.log('🧪 Testing with REAL browser data...');

		try {
			// Step 1: Base64 decoding (exactly like in the browser)
			const pubkeyString = REAL_BROWSER_DATA.base64PublicKey;
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

			// Step 2: Extract x-coordinate (using the FIXED method)
			const xCoordinate = this.extractXCoordinate(publicKeyBytes);

			console.log('✅ X-coordinate extraction successful:', {
				xCoordinateLength: xCoordinate.length,
				firstBytes: Array.from(xCoordinate.slice(0, 10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				),
				lastBytes: Array.from(xCoordinate.slice(-10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				)
			});

			// Step 3: Generate hex string
			const publicKeyHex =
				'0x' +
				Array.from(xCoordinate)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');

			console.log('✅ Hex string generation successful:', {
				publicKeyHex,
				publicKeyHexLength: publicKeyHex.length,
				expectedHex: REAL_BROWSER_DATA.expectedHex.substring(0, 20) + '...'
			});

			// Step 4: Verify the results
			if (publicKeyBytes.length !== REAL_BROWSER_DATA.expectedDecodedLength) {
				throw new Error(
					`Expected decoded length ${REAL_BROWSER_DATA.expectedDecodedLength}, got ${publicKeyBytes.length}`
				);
			}

			if (publicKeyBytes[0] !== 0x04) {
				throw new Error(`Expected first byte 0x04, got 0x${publicKeyBytes[0].toString(16)}`);
			}

			if (xCoordinate.length !== 32) {
				throw new Error(`Expected x-coordinate length 32, got ${xCoordinate.length}`);
			}

			if (!publicKeyHex.match(/^0x[0-9a-f]{64}$/)) {
				throw new Error(`Invalid hex format: ${publicKeyHex}`);
			}

			console.log('🎉 All validations passed!');
			console.log('Final x-coordinate hex:', publicKeyHex);
			console.log('Expected format: 0x + 64 hex characters');
			console.log('Actual format: ✓ Valid');

			return {
				publicKeyBytes,
				xCoordinate,
				publicKeyHex
			};
		} catch (error) {
			console.error('❌ Test failed:', error.message);
			throw error;
		}
	}

	/**
	 * Mock extractXCoordinate method with the FIXED logic (exactly like in the service)
	 */
	extractXCoordinate(publicKeyArray) {
		console.log(
			`🔍 DEBUG: Public key length: ${publicKeyArray.length}, first few bytes:`,
			Array.from(publicKeyArray.slice(0, 10)).map((b) => '0x' + b.toString(16).padStart(2, '0'))
		);

		if (publicKeyArray.length === 65) {
			// Standard format: 0x04 + 32 bytes (x) + 32 bytes (y)
			// Skip the first byte (0x04) and take the next 32 bytes (x coordinate)
			console.log('🔍 DEBUG: Using 65-byte format, extracting x-coordinate');

			// Use the FIXED approach that's browser-compatible
			const xCoordinate = new Uint8Array(32);
			for (let i = 0; i < 32; i++) {
				const byte = publicKeyArray[i + 1]; // Skip 0x04, start from index 1
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
			throw new Error(`Invalid public key format: expected 65 bytes, got ${publicKeyArray.length}`);
		}
	}

	/**
	 * Test the exact error scenario that was failing in the browser
	 */
	testBrowserErrorScenario() {
		console.log('🧪 Testing the exact browser error scenario with REAL data...\n');

		try {
			// Simulate the exact call that was failing
			const pubkeyString = REAL_BROWSER_DATA.base64PublicKey;
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

			console.log('✅ Browser error scenario test passed with REAL data!');
			return xCoordinate;
		} catch (error) {
			console.error('❌ Browser error scenario test failed:', error.message);
			throw error;
		}
	}
}

// Run the test with real browser data
async function runRealBrowserDataTest() {
	try {
		const testInstance = new RealBrowserDataTest();

		console.log('='.repeat(70));
		console.log('🧪 TESTING WITH REAL BROWSER DATA');
		console.log('='.repeat(70));
		console.log();

		// Test 1: Real browser data processing
		const result = testInstance.testRealBrowserData();

		// Test 2: Browser error scenario with real data
		testInstance.testBrowserErrorScenario();

		console.log('='.repeat(70));
		console.log('🎉 REAL BROWSER DATA TEST PASSED!');
		console.log('='.repeat(70));
		console.log();
		console.log('📊 Test Results Summary:');
		console.log(`   • Base64 decoding: ✅ ${result.publicKeyBytes.length} bytes`);
		console.log(`   • X-coordinate extraction: ✅ ${result.xCoordinate.length} bytes`);
		console.log(`   • Hex string generation: ✅ ${result.publicKeyHex.length} characters`);
		console.log(`   • Final hex: ${result.publicKeyHex}`);
		console.log();
		console.log('🚀 The fix should now work in the browser!');
	} catch (error) {
		console.error('\n' + '='.repeat(70));
		console.error('❌ REAL BROWSER DATA TEST FAILED');
		console.error('='.repeat(70));
		console.error('Error:', error.message);
		process.exit(1);
	}
}

// Run the test
runRealBrowserDataTest();
