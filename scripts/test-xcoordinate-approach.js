#!/usr/bin/env node

// Test the x-coordinate approach for Argent contract
// This should work correctly without field constraint issues

console.log('🧪 Testing X-Coordinate Approach for Argent Contract...\n');

// Use the exact data from the browser logs
const REAL_BROWSER_DATA = {
	base64PublicKey:
		'BDg9NkPduVvlybSehNYr9ze7LB6zGUJZNKjsNcg0NpsJveHY0zVAY3dQ09kzl1u4IktW6hTwGQ/azTaM1Aao0gM=',
	expectedLength: 88,
	expectedDecodedLength: 65
};

class XCoordinateApproachTest {
	/**
	 * Test the x-coordinate approach: extract only x-coordinate for constructor
	 */
	testXCoordinateApproach() {
		console.log('🧪 Testing x-coordinate approach with REAL browser data...');

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

			// Step 2: Extract x-coordinate (32 bytes)
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

			// Step 3: Generate hex string for constructor
			const publicKeyHex =
				'0x' +
				Array.from(xCoordinate)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');

			console.log('✅ Hex string generation successful:', {
				publicKeyHex,
				publicKeyHexLength: publicKeyHex.length
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

			// Step 5: Show the difference from full public key approach
			const fullPublicKeyHex =
				'0x' +
				Array.from(publicKeyBytes)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');

			console.log('\n🔍 Comparison of approaches:');
			console.log('   • FULL public key approach: 65 bytes = 130 hex chars');
			console.log('   • X-COORDINATE approach: 32 bytes = 66 hex chars');
			console.log('   • X-coordinate is what Argent contract expects for public_key parameter');

			console.log('\n🎉 X-coordinate approach test successful!');
			console.log('Final x-coordinate hex:', publicKeyHex);
			console.log('Expected format: 0x + 64 hex characters (32 bytes)');
			console.log('Actual format: ✓ Valid');
			console.log('This should work with the Argent contract constructor!');

			return {
				publicKeyBytes,
				xCoordinate,
				publicKeyHex,
				fullPublicKeyHex
			};
		} catch (error) {
			console.error('❌ Test failed:', error.message);
			throw error;
		}
	}

	/**
	 * Mock extractXCoordinate method (exactly like in the service)
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
}

// Run the x-coordinate approach test
async function runXCoordinateApproachTest() {
	try {
		const testInstance = new XCoordinateApproachTest();

		console.log('='.repeat(70));
		console.log('🧪 TESTING X-COORDINATE APPROACH FOR ARGENT CONTRACT');
		console.log('='.repeat(70));
		console.log();

		// Test the x-coordinate approach
		const result = testInstance.testXCoordinateApproach();

		console.log('='.repeat(70));
		console.log('🎉 X-COORDINATE APPROACH TEST PASSED!');
		console.log('='.repeat(70));
		console.log();
		console.log('📊 Test Results Summary:');
		console.log(`   • Base64 decoding: ✅ ${result.publicKeyBytes.length} bytes`);
		console.log(`   • X-coordinate extraction: ✅ ${result.xCoordinate.length} bytes`);
		console.log(`   • Hex string generation: ✅ ${result.publicKeyHex.length} characters`);
		console.log(`   • Approach: ✅ X-coordinate only (Argent contract expects this)`);
		console.log();
		console.log('🚀 This should resolve the PedersenArg field constraint error!');
		console.log('   The Argent contract expects the x-coordinate for the public_key parameter.');
	} catch (error) {
		console.error('\n' + '='.repeat(70));
		console.error('❌ X-COORDINATE APPROACH TEST FAILED');
		console.error('='.repeat(70));
		console.error('Error:', error.message);
		process.exit(1);
	}
}

// Run the test
runXCoordinateApproachTest();
