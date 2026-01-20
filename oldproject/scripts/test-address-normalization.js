#!/usr/bin/env node

/**
 * Test Address Normalization
 *
 * This script tests if our address normalization correctly identifies
 * WBTC events even when address padding differs.
 */

// Simulate the normalizeAddress function from BlockchainScannerService
function normalizeAddress(address) {
	if (!address) return '';

	let normalized = address.toLowerCase();

	// Remove 0x prefix
	if (normalized.startsWith('0x')) {
		normalized = normalized.substring(2);
	}

	// Remove leading zeros but keep at least one character
	normalized = normalized.replace(/^0+/, '') || '0';

	return normalized;
}

function testAddressNormalization() {
	console.log('🧪 Testing Address Normalization for WBTC Detection');
	console.log('='.repeat(60));

	// Test addresses from your transaction
	const eventAddress = '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
	const wbtcAddress = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';

	console.log('\n📊 Original Addresses:');
	console.log(`Event Address: ${eventAddress}`);
	console.log(`WBTC Address:  ${wbtcAddress}`);

	console.log('\n🔄 Normalized Addresses:');
	const normalizedEvent = normalizeAddress(eventAddress);
	const normalizedWbtc = normalizeAddress(wbtcAddress);

	console.log(`Event Normalized: ${normalizedEvent}`);
	console.log(`WBTC Normalized:  ${normalizedWbtc}`);

	const isMatch = normalizedEvent === normalizedWbtc;
	console.log(`\n✅ Match Result: ${isMatch ? 'MATCH ✅' : 'NO MATCH ❌'}`);

	if (isMatch) {
		console.log('🎉 SUCCESS: Event would be identified as WBTC!');
		console.log('💾 Scanner would store: Amount 1700 as WBTC event');
	} else {
		console.log('❌ FAILURE: Event would NOT be identified as WBTC');
		console.log('🔄 Scanner would fallback to amount-based selection');
	}

	// Test some other variations
	console.log('\n🧪 Testing Other Address Variations:');
	const testCases = [
		'0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac', // lowercase with 03
		'0x3FE2B97C1FD336E750087D68B9B867997FD64A2661FF3CA5A7C771641E8E7AC', // uppercase without 03
		'0x003fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac' // with 00 padding
	];

	testCases.forEach((testAddr, index) => {
		const normalized = normalizeAddress(testAddr);
		const matches = normalized === normalizedWbtc;
		console.log(
			`   Test ${index + 1}: ${testAddr.substring(0, 20)}... -> ${matches ? '✅' : '❌'}`
		);
	});

	console.log('\n✨ Test complete');
}

// Run the test
testAddressNormalization();
