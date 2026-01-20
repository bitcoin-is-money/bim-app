#!/usr/bin/env node

/**
 * Test Address Normalization Issue
 *
 * This script demonstrates the exact normalization issue causing
 * the transaction to be attributed to the wrong address.
 */

// Current normalization function (problematic)
function currentNormalizeAddress(address) {
	const clean = address.startsWith('0x') ? address.slice(2) : address;
	return clean.replace(/^0+/, '').toLowerCase() || '0';
}

// Proposed improved normalization function
function improvedNormalizeAddress(address) {
	if (!address) return '';

	// Remove 0x prefix if present
	let clean = address.startsWith('0x') ? address.slice(2) : address;

	// Convert to lowercase
	clean = clean.toLowerCase();

	// Pad to standard Starknet address length (64 characters) before removing leading zeros
	// This ensures consistent comparison
	clean = clean.padStart(64, '0');

	// Now remove leading zeros, but keep at least one character
	clean = clean.replace(/^0+/, '') || '0';

	return clean;
}

// Alternative approach: canonical address format
function canonicalNormalizeAddress(address) {
	if (!address) return '';

	// Remove 0x prefix if present
	let clean = address.startsWith('0x') ? address.slice(2) : address;

	// Convert to lowercase
	clean = clean.toLowerCase();

	// For Starknet addresses, we should pad to 64 characters for consistent comparison
	// but then we can choose to either keep the padding or remove leading zeros
	clean = clean.padStart(64, '0');

	// Instead of removing leading zeros, let's keep the canonical 64-char format
	// This ensures consistent matching regardless of how the address is represented
	return clean;
}

function testNormalization() {
	console.log('🧪 Address Normalization Issue Test');
	console.log('='.repeat(50));

	// The problematic addresses from our investigation
	const registeredAddress = '0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';
	const eventAddress = '0x586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';

	console.log(`Registered Address: ${registeredAddress}`);
	console.log(`Event Address:      ${eventAddress}`);
	console.log();

	// Test current normalization
	console.log('📋 Current Normalization Results:');
	const currentRegistered = currentNormalizeAddress(registeredAddress);
	const currentEvent = currentNormalizeAddress(eventAddress);

	console.log(`Registered -> "${currentRegistered}"`);
	console.log(`Event ->      "${currentEvent}"`);
	console.log(`Match: ${currentRegistered === currentEvent ? '✅ YES' : '❌ NO'}`);
	console.log();

	// Test improved normalization
	console.log('🔧 Improved Normalization Results:');
	const improvedRegistered = improvedNormalizeAddress(registeredAddress);
	const improvedEvent = improvedNormalizeAddress(eventAddress);

	console.log(`Registered -> "${improvedRegistered}"`);
	console.log(`Event ->      "${improvedEvent}"`);
	console.log(`Match: ${improvedRegistered === improvedEvent ? '✅ YES' : '❌ NO'}`);
	console.log();

	// Test canonical normalization
	console.log('🎯 Canonical Normalization Results:');
	const canonicalRegistered = canonicalNormalizeAddress(registeredAddress);
	const canonicalEvent = canonicalNormalizeAddress(eventAddress);

	console.log(`Registered -> "${canonicalRegistered}"`);
	console.log(`Event ->      "${canonicalEvent}"`);
	console.log(`Match: ${canonicalRegistered === canonicalEvent ? '✅ YES' : '❌ NO'}`);
	console.log();

	// Test various edge cases
	console.log('🧪 Edge Case Testing:');
	const testCases = [
		'0x0000000000000000000000000000000000000000000000000000000000000001',
		'0x1',
		'0x00000001',
		'0x0001',
		'0x01',
		'1',
		'0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda',
		'0x586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda',
		'586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda'
	];

	console.log('Address variations and their normalized forms:');
	testCases.forEach((addr, index) => {
		const current = currentNormalizeAddress(addr);
		const canonical = canonicalNormalizeAddress(addr);

		console.log(`${index + 1}. ${addr}`);
		console.log(`   Current:   "${current}"`);
		console.log(`   Canonical: "${canonical}"`);
		console.log();
	});

	// Demonstrate the specific bug
	console.log('🐛 The Specific Bug:');
	console.log('When addresses have different leading zero representations,');
	console.log('the current normalization creates different normalized values:');
	console.log();

	const addr1 = '0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';
	const addr2 = '0x586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';

	console.log(`Address 1: ${addr1}`);
	console.log(`Address 2: ${addr2}`);
	console.log(`Current normalize 1: "${currentNormalizeAddress(addr1)}"`);
	console.log(`Current normalize 2: "${currentNormalizeAddress(addr2)}"`);
	console.log(
		`Current match: ${currentNormalizeAddress(addr1) === currentNormalizeAddress(addr2) ? '✅' : '❌'}`
	);
	console.log();
	console.log(`Canonical normalize 1: "${canonicalNormalizeAddress(addr1)}"`);
	console.log(`Canonical normalize 2: "${canonicalNormalizeAddress(addr2)}"`);
	console.log(
		`Canonical match: ${canonicalNormalizeAddress(addr1) === canonicalNormalizeAddress(addr2) ? '✅' : '❌'}`
	);
	console.log();

	// Recommendation
	console.log('💡 Recommendation:');
	console.log('Use canonical normalization to ensure consistent address matching');
	console.log('regardless of leading zero representation in the source data.');
}

// Run the test
testNormalization();
