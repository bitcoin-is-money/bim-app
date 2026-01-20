#!/usr/bin/env node

/**
 * Test script for hex conversion fix
 * This tests the Array.from(Buffer) conversion that was causing the "0x" issue
 */

console.log('🧪 Testing hex conversion fix...\n');

// Test 1: Simulate the x-coordinate extraction
console.log('1️⃣ Testing x-coordinate to hex conversion...');

try {
	// Simulate what we get from @noble-curves extraction
	const xCoordinateBytes = new Uint8Array(32);

	// Fill with sample data (similar to what we see in logs)
	xCoordinateBytes[0] = 0x31; // '1'
	xCoordinateBytes[1] = 0xc6; // 'Æ'
	xCoordinateBytes[2] = 0x91; // '•'
	xCoordinateBytes[3] = 0x20; // ' '
	xCoordinateBytes[4] = 0x7c; // '|'
	xCoordinateBytes[5] = 0x4f; // 'O'
	xCoordinateBytes[6] = 0x03; // ETX
	xCoordinateBytes[7] = 0xb9; // '¹'
	xCoordinateBytes[8] = 0xd9; // 'Ù'
	xCoordinateBytes[9] = 0x77; // 'w'

	// Fill the rest with random data
	for (let i = 10; i < 32; i++) {
		xCoordinateBytes[i] = i % 256;
	}

	console.log('   X-coordinate bytes length:', xCoordinateBytes.length);
	console.log(
		'   First few bytes:',
		Array.from(xCoordinateBytes.slice(0, 10)).map((b) => '0x' + b.toString(16).padStart(2, '0'))
	);

	// Test the old problematic conversion (this was causing "0x" issue)
	const oldConversion =
		'0x' +
		Array.from(xCoordinateBytes)
			.filter((b) => b !== undefined && b !== null && typeof b === 'number')
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

	console.log('   Old conversion result:', oldConversion.substring(0, 20) + '...');
	console.log('   Old conversion length:', oldConversion.length);

	// Test our new fixed conversion
	const newConversion =
		'0x' +
		Array.from(xCoordinateBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

	console.log('   New conversion result:', newConversion.substring(0, 20) + '...');
	console.log('   New conversion length:', newConversion.length);

	// Verify the new conversion works
	if (newConversion.length > 2 && newConversion.startsWith('0x')) {
		console.log('   ✅ New conversion successful - proper hex string generated');

		// Test BigInt conversion (this was failing before)
		try {
			const bigIntValue = BigInt(newConversion);
			console.log(
				'   ✅ BigInt conversion successful:',
				bigIntValue.toString(16).substring(0, 20) + '...'
			);
		} catch (bigIntError) {
			console.log('   ❌ BigInt conversion failed:', bigIntError.message);
		}
	} else {
		console.log('   ❌ New conversion failed - hex string not properly generated');
	}
} catch (error) {
	console.error('   ❌ Error testing conversion:', error.message);
}

console.log('\n2️⃣ Testing with actual Buffer (Node.js environment)...');
try {
	// In Node.js, Buffer extends Uint8Array
	const buffer = Buffer.from([0x31, 0xc6, 0x91, 0x20, 0x7c, 0x4f, 0x03, 0xb9, 0xd9, 0x77]);

	console.log('   Buffer length:', buffer.length);
	console.log('   Buffer type:', buffer.constructor.name);

	// Test conversion
	const hexString =
		'0x' +
		Array.from(buffer)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

	console.log('   Hex conversion result:', hexString);
	console.log('   ✅ Buffer conversion successful');
} catch (error) {
	console.log('   ❌ Buffer conversion failed:', error.message);
}

console.log('\n🎉 Hex conversion test completed!');
console.log('   The fix should resolve the "Cannot convert 0x to a BigInt" error.');
