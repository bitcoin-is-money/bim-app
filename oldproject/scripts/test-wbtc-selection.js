#!/usr/bin/env node

/**
 * Test WBTC Event Selection Script
 *
 * This script tests the updated blockchain scanner logic that prioritizes
 * WBTC token events over amount-based selection.
 */

// Mock data simulating events from both transactions
const mockEvents = [
	// Original transaction events
	{
		transactionHash: '0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196',
		blockNumber: 1792224,
		tokenAddress: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
		fromAddress: '0x4f278e1f19e495c3b1dd35ef307c4f7510768ed95481958fbae588bd173f79a',
		toAddress: '0x507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6',
		amount: '0x3928900c1db978',
		timestamp: new Date()
	},
	{
		transactionHash: '0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196',
		blockNumber: 1792224,
		tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac', // WBTC with lowercase!
		fromAddress: '0x4f278e1f19e495c3b1dd35ef307c4f7510768ed95481958fbae588bd173f79a',
		toAddress: '0x507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6',
		amount: '0x7c0',
		timestamp: new Date()
	},
	{
		transactionHash: '0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196',
		blockNumber: 1792224,
		tokenAddress: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
		fromAddress: '0xed260a2d0a05a706822e43b3b10c4435b524f7bdb13b44c4c9c6bbcf16a6fb',
		toAddress: '0x1176a1bd84444c89232ec27754698e5d2e7e1a7f1539f12027f28b23ec9f3d8',
		amount: '0x10e36a757592a80',
		timestamp: new Date()
	},
	// Recent transaction event (missing leading zero)
	{
		transactionHash: '0x573a3ed9528e61142580c60b5c443a77a393379b0344b7b2fdf45b736263117',
		blockNumber: 1792490,
		tokenAddress: '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac', // WBTC missing leading zero!
		fromAddress: '0x507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6',
		toAddress: '0x4592bf37f51229109ddf190f33750ea1267de436a171b94503a945797e962e6',
		amount: '0x6a4', // 1700
		timestamp: new Date()
	}
];

// WBTC contract address constant
const WBTC_CONTRACT_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';

// Address normalization function (same as in BlockchainScannerService)
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

function testWbtcSelection() {
	console.log('🧪 Testing WBTC Event Selection Logic');
	console.log('='.repeat(50));

	console.log('\n📊 Mock Events:');
	mockEvents.forEach((event, index) => {
		// Test both exact match and normalized match
		const isWbtcExact = event.tokenAddress === WBTC_CONTRACT_ADDRESS;
		const normalizedEventToken = normalizeAddress(event.tokenAddress);
		const normalizedWbtcToken = normalizeAddress(WBTC_CONTRACT_ADDRESS);
		const isWbtcNormalized = normalizedEventToken === normalizedWbtcToken;
		const amount = BigInt(event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`);

		console.log(`   Event ${index + 1}:`);
		console.log(`     Token: ${event.tokenAddress.substring(0, 16)}...`);
		console.log(`     Is WBTC (exact): ${isWbtcExact ? '✅ YES' : '❌ NO'}`);
		console.log(`     Is WBTC (normalized): ${isWbtcNormalized ? '✅ YES' : '❌ NO'}`);
		console.log(`     Amount: ${event.amount} (${amount.toString()})`);
		console.log(`     TX: ${event.transactionHash.substring(0, 16)}...`);
	});

	console.log('\n🔍 Testing Selection Logic...');

	// Simulate the OLD logic (select by largest amount)
	console.log('\n   OLD Logic (Select by largest amount):');
	const nonZeroEvents = mockEvents.filter((event) => {
		try {
			const hexAmount = event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`;
			return BigInt(hexAmount) > 0n;
		} catch {
			return false;
		}
	});

	if (nonZeroEvents.length > 0) {
		const selectedByAmount = nonZeroEvents.reduce((max, current) => {
			try {
				const maxAmount = BigInt(max.amount.startsWith('0x') ? max.amount : `0x${max.amount}`);
				const currentAmount = BigInt(
					current.amount.startsWith('0x') ? current.amount : `0x${current.amount}`
				);
				return currentAmount > maxAmount ? current : max;
			} catch {
				return max;
			}
		});

		const amount = BigInt(
			selectedByAmount.amount.startsWith('0x')
				? selectedByAmount.amount
				: `0x${selectedByAmount.amount}`
		);
		const isWbtc = selectedByAmount.tokenAddress === WBTC_CONTRACT_ADDRESS;

		console.log(`     Selected: Event with amount ${amount.toString()}`);
		console.log(`     Is WBTC: ${isWbtc ? '✅ YES' : '❌ NO'}`);
		console.log(`     Token: ${selectedByAmount.tokenAddress.substring(0, 16)}...`);

		if (!isWbtc) {
			console.log(`     🚨 PROBLEM: Selected non-WBTC event!`);
		}
	}

	// Simulate the NEW logic (prioritize WBTC)
	console.log('\n   NEW Logic (Prioritize WBTC):');

	// First priority: Find WBTC token events (using normalization)
	const wbtcEvents = mockEvents.filter((event) => {
		const normalizedEventToken = normalizeAddress(event.tokenAddress);
		const normalizedWbtcToken = normalizeAddress(WBTC_CONTRACT_ADDRESS);
		return normalizedEventToken === normalizedWbtcToken;
	});

	console.log(`     Found ${wbtcEvents.length} WBTC events`);

	let selectedEvent;

	if (wbtcEvents.length > 0) {
		// If WBTC events found, select the one with highest non-zero amount
		const nonZeroWbtcEvents = wbtcEvents.filter((event) => {
			try {
				const hexAmount = event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`;
				return BigInt(hexAmount) > 0n;
			} catch {
				return false;
			}
		});

		if (nonZeroWbtcEvents.length > 0) {
			// Select the WBTC event with the largest amount
			selectedEvent = nonZeroWbtcEvents.reduce((max, current) => {
				try {
					const maxAmount = BigInt(max.amount.startsWith('0x') ? max.amount : `0x${max.amount}`);
					const currentAmount = BigInt(
						current.amount.startsWith('0x') ? current.amount : `0x${current.amount}`
					);
					return currentAmount > maxAmount ? current : max;
				} catch {
					return max;
				}
			});

			console.log(`     ✅ Selected WBTC event: ${selectedEvent.amount}`);
		} else {
			// All WBTC events have zero amounts, use first WBTC event
			selectedEvent = wbtcEvents[0];
			console.log(`     ⚠️  Selected WBTC event with zero amount: ${selectedEvent.amount}`);
		}
	} else {
		// No WBTC events found, fallback to amount-based selection
		console.log(`     ❌ No WBTC events found, falling back to amount-based selection`);

		if (nonZeroEvents.length > 0) {
			selectedEvent = nonZeroEvents.reduce((max, current) => {
				try {
					const maxAmount = BigInt(max.amount.startsWith('0x') ? max.amount : `0x${max.amount}`);
					const currentAmount = BigInt(
						current.amount.startsWith('0x') ? current.amount : `0x${current.amount}`
					);
					return currentAmount > maxAmount ? current : max;
				} catch {
					return max;
				}
			});

			console.log(`     Selected non-zero amount event (fallback): ${selectedEvent.amount}`);
		} else {
			selectedEvent = mockEvents[0];
			console.log(`     All events have zero amounts, using first event: ${selectedEvent.amount}`);
		}
	}

	// Show final selection
	if (selectedEvent) {
		const amount = BigInt(
			selectedEvent.amount.startsWith('0x') ? selectedEvent.amount : `0x${selectedEvent.amount}`
		);
		const isWbtcExact = selectedEvent.tokenAddress === WBTC_CONTRACT_ADDRESS;
		const normalizedEventToken = normalizeAddress(selectedEvent.tokenAddress);
		const normalizedWbtcToken = normalizeAddress(WBTC_CONTRACT_ADDRESS);
		const isWbtcNormalized = normalizedEventToken === normalizedWbtcToken;

		console.log(`\n📋 Final Selection:`);
		console.log(`   Amount: ${amount.toString()}`);
		console.log(`   Token: ${selectedEvent.tokenAddress}`);
		console.log(`   Is WBTC (exact): ${isWbtcExact ? '✅ YES' : '❌ NO'}`);
		console.log(`   Is WBTC (normalized): ${isWbtcNormalized ? '✅ YES' : '❌ NO'}`);
		console.log(`   Transaction: ${selectedEvent.transactionHash.substring(0, 16)}...`);

		if (isWbtcNormalized) {
			console.log(`   ✅ SUCCESS: WBTC event selected correctly!`);
		} else {
			console.log(`   🚨 FAILURE: Non-WBTC event selected!`);
		}
	}

	console.log('\n✨ Test complete');
}

// Run the test
testWbtcSelection();
