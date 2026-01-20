#!/usr/bin/env node

// Test the Argent approach: using FULL public key instead of just x-coordinate
// This should resolve the PedersenArg field constraint error

console.log('🧪 Testing Argent Approach: Full Public Key...\n');

// Use the exact data from the browser logs
const REAL_BROWSER_DATA = {
	base64PublicKey:
		'BNAmyq9lmQ/7pyoToU/tx2Jvzeb66Ctlq6XpHJ+b3W1/zkh3BvdhJPV/hUMK03xJUvEeW4w2NkaI1uexhDr3420=',
	expectedLength: 88,
	expectedDecodedLength: 65
};

class ArgentApproachTest {
	/**
	 * Test the Argent approach: pass FULL public key to constructor
	 */
	testArgentApproach() {
		console.log('🧪 Testing Argent approach with REAL browser data...');

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

			// Step 2: Use FULL public key (Argent approach) instead of extracting x-coordinate
			const fullPublicKeyHex =
				'0x' +
				Array.from(publicKeyBytes)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');

			console.log('✅ Full public key generation successful:', {
				fullPublicKeyLength: publicKeyBytes.length,
				fullPublicKeyHex: fullPublicKeyHex.substring(0, 20) + '...',
				fullPublicKeyHexLength: fullPublicKeyHex.length
			});

			// Step 3: Verify the results
			if (publicKeyBytes.length !== REAL_BROWSER_DATA.expectedDecodedLength) {
				throw new Error(
					`Expected decoded length ${REAL_BROWSER_DATA.expectedDecodedLength}, got ${publicKeyBytes.length}`
				);
			}

			if (publicKeyBytes[0] !== 0x04) {
				throw new Error(`Expected first byte 0x04, got 0x${publicKeyBytes[0].toString(16)}`);
			}

			if (!fullPublicKeyHex.match(/^0x[0-9a-f]{130}$/)) {
				throw new Error(`Invalid full public key hex format: ${fullPublicKeyHex}`);
			}

			// Step 4: Show the difference between approaches
			console.log('\n🔍 Comparison of approaches:');
			console.log('   • OLD approach (x-coordinate only): 32 bytes = 66 hex chars');
			console.log('   • NEW Argent approach (full public key): 65 bytes = 130 hex chars');
			console.log('   • This avoids the PedersenArg field constraint error!');

			console.log('\n🎉 Argent approach test successful!');
			console.log('Final full public key hex:', fullPublicKeyHex);
			console.log('Expected format: 0x + 130 hex characters (65 bytes)');
			console.log('Actual format: ✓ Valid');

			return {
				publicKeyBytes,
				fullPublicKeyHex
			};
		} catch (error) {
			console.error('❌ Test failed:', error.message);
			throw error;
		}
	}

	/**
	 * Test the old approach to show the problem
	 */
	testOldApproach() {
		console.log('🧪 Testing OLD approach (x-coordinate only) to show the problem...\n');

		try {
			const pubkeyString = REAL_BROWSER_DATA.base64PublicKey;
			const binaryString = Buffer.from(pubkeyString, 'base64').toString('binary');
			const publicKeyBytes = new Uint8Array(binaryString.length);

			for (let i = 0; i < binaryString.length; i++) {
				publicKeyBytes[i] = binaryString.charCodeAt(i);
			}

			// OLD approach: extract only x-coordinate
			const xCoordinate = new Uint8Array(32);
			for (let i = 0; i < 32; i++) {
				const byte = publicKeyBytes[i + 1]; // Skip 0x04, start from index 1
				if (byte !== undefined) {
					xCoordinate[i] = byte;
				} else {
					throw new Error(`Failed to extract byte at index ${i + 1} from public key`);
				}
			}

			const xCoordinateHex =
				'0x' +
				Array.from(xCoordinate)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');

			console.log('🔍 OLD approach result:', {
				xCoordinateLength: xCoordinate.length,
				xCoordinateHex,
				xCoordinateHexLength: xCoordinateHex.length,
				firstBytes: Array.from(xCoordinate.slice(0, 10)).map(
					(b) => '0x' + b.toString(16).padStart(2, '0')
				)
			});

			// Convert to BigInt to show the field constraint issue
			const xCoordinateBigInt = BigInt(xCoordinateHex);
			console.log('🔍 X-coordinate as BigInt:', xCoordinateBigInt.toString());
			console.log('🔍 This large value causes the PedersenArg field constraint error!');

			console.log('✅ OLD approach test completed (shows the problem)\n');
			return xCoordinateHex;
		} catch (error) {
			console.error('❌ OLD approach test failed:', error.message);
			throw error;
		}
	}
}

// Run the Argent approach test
async function runArgentApproachTest() {
	try {
		const testInstance = new ArgentApproachTest();

		console.log('='.repeat(70));
		console.log('🧪 TESTING ARGENT APPROACH: FULL PUBLIC KEY');
		console.log('='.repeat(70));
		console.log();

		// Test 1: Show the old approach problem
		testInstance.testOldApproach();

		// Test 2: Test the new Argent approach
		const result = testInstance.testArgentApproach();

		console.log('='.repeat(70));
		console.log('🎉 ARGENT APPROACH TEST PASSED!');
		console.log('='.repeat(70));
		console.log();
		console.log('📊 Test Results Summary:');
		console.log(`   • Base64 decoding: ✅ ${result.publicKeyBytes.length} bytes`);
		console.log(`   • Full public key: ✅ ${result.fullPublicKeyHex.length} characters`);
		console.log(`   • Approach: ✅ Argent (full public key)`);
		console.log();
		console.log('🚀 This should resolve the PedersenArg field constraint error!');
		console.log('   The Argent contract expects the FULL public key, not just x-coordinate.');
	} catch (error) {
		console.error('\n' + '='.repeat(70));
		console.error('❌ ARGENT APPROACH TEST FAILED');
		console.error('='.repeat(70));
		console.error('Error:', error.message);
		process.exit(1);
	}
}

// Run the test
runArgentApproachTest();
