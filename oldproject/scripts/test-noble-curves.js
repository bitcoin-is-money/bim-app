#!/usr/bin/env node

/**
 * Test script for @noble-curves integration
 * This tests the actual public key parsing logic we're using in production
 */

import { p256 } from '@noble/curves/nist';
import { numberToBytesBE } from '@noble/curves/utils';

console.log('🧪 Testing @noble-curves integration...\n');

// Test 1: Test the p256.Point.fromHex method
console.log('1️⃣ Testing p256.Point.fromHex...');
try {
	// This is a sample 65-byte uncompressed public key (0x04 + 32 bytes x + 32 bytes y)
	const samplePublicKeyHex =
		'0x04f16110fd5161d663174dc4cc24f300e5184214aae3b4a0f53c7def1672225adcd5b6fce82ed904dd22e31a1a9a407cdaeb9d39c41ec2eeb336306391ca3c30d2';

	// Convert hex to Uint8Array (simulating what we get from WebAuthn)
	const publicKeyArray = new Uint8Array(Buffer.from(samplePublicKeyHex.slice(2), 'hex'));

	console.log('   Sample public key length:', publicKeyArray.length, 'bytes');
	console.log(
		'   First few bytes:',
		Array.from(publicKeyArray.slice(0, 10)).map((b) => '0x' + b.toString(16).padStart(2, '0'))
	);

	// Test our actual parsing logic
	const publicKey = p256.Point.fromHex(publicKeyArray);
	console.log('   ✅ Successfully parsed with @noble-curves');

	// Test x-coordinate extraction (what we do in StarknetService)
	const xCoordinate = publicKey.x;
	const xCoordinateBytes = numberToBytesBE(xCoordinate, 32);

	console.log('   X-coordinate length:', xCoordinateBytes.length, 'bytes');
	console.log(
		'   X-coordinate (hex):',
		'0x' +
			Array.from(xCoordinateBytes)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
	);

	// Test raw bytes extraction (what we do in WebauthnAttestation)
	const rawPublicKeyBytes = publicKey.toRawBytes(false); // false = uncompressed

	console.log('   Raw public key length:', rawPublicKeyBytes.length, 'bytes');
	console.log('   Raw public key starts with 0x04:', rawPublicKeyBytes[0] === 0x04);

	if (rawPublicKeyBytes.length === 65 && rawPublicKeyBytes[0] === 0x04) {
		const x = rawPublicKeyBytes.slice(1, 33);
		const y = rawPublicKeyBytes.slice(33);
		console.log('   ✅ Successfully extracted x and y coordinates');
		console.log('   X coordinate length:', x.length, 'bytes');
		console.log('   Y coordinate length:', y.length, 'bytes');
	}
} catch (error) {
	console.error('   ❌ Error testing p256.Point.fromHex:', error.message);
}

console.log('\n2️⃣ Testing error handling...');
try {
	// Test with invalid data to make sure errors are thrown properly
	const invalidData = new Uint8Array([1, 2, 3, 4, 5]); // Too short

	const publicKey = p256.Point.fromHex(invalidData);
	console.log('   ❌ Should have thrown an error for invalid data');
} catch (error) {
	console.log('   ✅ Properly threw error for invalid data:', error.message);
}

console.log('\n3️⃣ Testing with different public key formats...');
try {
	// Test with a different sample key
	const samplePublicKeyHex2 =
		'0x04ffb1f1741e7693cdbc8b449eb9348f353310cd7e5651d51c1c1671637986c338765aa072514b6d3b6ddec6514ef4e11150648b183a467c9939d29f52595ebb58';
	const publicKeyArray2 = new Uint8Array(Buffer.from(samplePublicKeyHex2.slice(2), 'hex'));

	const publicKey2 = p256.Point.fromHex(publicKeyArray2);
	const xCoordinate2 = publicKey2.x;
	const xCoordinateBytes2 = numberToBytesBE(xCoordinate2, 32);

	console.log('   ✅ Successfully parsed second sample key');
	console.log(
		'   X-coordinate (hex):',
		'0x' +
			Array.from(xCoordinateBytes2)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
	);
} catch (error) {
	console.error('   ❌ Error testing second sample key:', error.message);
}

console.log('\n4️⃣ Testing SPKI format parsing (91 bytes)...');
try {
	// Simulate SPKI format - this is what WebAuthn actually provides
	// We'll create a mock SPKI structure with the public key embedded
	const mockSPKI = new Uint8Array(91);

	// Fill with some mock SPKI header data (avoiding 0x04)
	for (let i = 0; i < 20; i++) {
		mockSPKI[i] = 0x30; // Use a safe byte value
	}

	// Insert our sample public key at position 20
	const samplePublicKeyHex =
		'0x04f16110fd5161d663174dc4cc24f300e5184214aae3b4a0f53c7def1672225adcd5b6fce82ed904dd22e31a1a9a407cdaeb9d39c41ec2eeb336306391ca3c30d2';
	const publicKeyBytes = new Uint8Array(Buffer.from(samplePublicKeyHex.slice(2), 'hex'));

	// Copy the public key into the SPKI at position 20
	mockSPKI.set(publicKeyBytes, 20);

	// Fill the rest with safe data (avoiding 0x04)
	for (let i = 85; i < 91; i++) {
		mockSPKI[i] = 0x30; // Use a safe byte value
	}

	console.log('   Mock SPKI length:', mockSPKI.length, 'bytes');
	console.log('   Looking for 0x04 marker...');

	// Test our SPKI parsing logic
	const keyStartIndex = mockSPKI.findIndex((byte) => {
		return byte === 0x04;
	});

	if (keyStartIndex !== -1 && keyStartIndex + 65 <= mockSPKI.length) {
		console.log('   ✅ Found 0x04 marker at index:', keyStartIndex);

		// Extract the raw public key (0x04 + x + y)
		const extractedPublicKey = mockSPKI.slice(keyStartIndex, keyStartIndex + 65);
		console.log('   Extracted public key length:', extractedPublicKey.length, 'bytes');

		// Now test with @noble-curves
		const publicKey = p256.Point.fromHex(extractedPublicKey);
		const xCoordinate = publicKey.x;
		const xCoordinateBytes = numberToBytesBE(xCoordinate, 32);

		console.log('   ✅ Successfully parsed extracted public key with @noble-curves');
		console.log(
			'   X-coordinate (hex):',
			'0x' +
				Array.from(xCoordinateBytes)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('')
		);
	} else {
		console.log('   ❌ Could not find 0x04 marker in SPKI');
		console.log(
			'   First few bytes:',
			Array.from(mockSPKI.slice(0, 30)).map((b) => '0x' + b.toString(16).padStart(2, '0'))
		);
		console.log(
			'   Bytes around position 20:',
			Array.from(mockSPKI.slice(18, 25)).map((b) => '0x' + b.toString(16).padStart(2, '0'))
		);
	}
} catch (error) {
	console.error('   ❌ Error testing SPKI format:', error.message);
}

console.log('\n🎉 @noble-curves integration test completed!');
console.log('   If all tests passed, our code should work correctly in production.');
