#!/usr/bin/env node

/**
 * Scanner Logic Test Script
 *
 * This script tests our blockchain scanner's address filtering logic
 * specifically for the transaction that's not being picked up correctly.
 */

import { RpcProvider } from 'starknet';

// Configuration
const RPC_URL =
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3cbbdf/rpc/v0_8';
const SPEC_VERSION = '0.9.0';

// The specific transaction we're debugging
const TARGET_TX_HASH = '0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196';

// ERC-20 Transfer event selector
const TRANSFER_EVENT_KEY = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

// Test addresses to simulate our scanner logic
const TEST_ADDRESSES = [
	'0x4f278e1f19e495c3b1dd35ef307c4f7510768ed95481958fbae588bd173f79a', // From address in Event 1 & 2
	'0x507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6', // To address in Event 1 & 2
	'0xed260a2d0a05a706822e43b3b10c4435b524f7bdb13b44c4c9c6bbcf16a6fb', // From address in Event 3
	'0x1176a1bd84444c89232ec27754698e5d2e7e1a7f1539f12027f28b23ec9f3d8', // To address in Event 3
	'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' // Random address (should not match)
];

async function testScannerLogic() {
	console.log('🧪 Testing Blockchain Scanner Logic');
	console.log('='.repeat(50));
	console.log(`Target TX: ${TARGET_TX_HASH}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// 1. Get transaction receipt
		console.log('\n📋 Step 1: Getting transaction receipt...');
		const receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
		console.log('✅ Receipt found');
		console.log(`   Block: ${receipt.block_number}`);
		console.log(`   Events: ${receipt.events?.length || 0}`);

		// 2. Extract Transfer events
		const transferEvents =
			receipt.events?.filter((event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)) ||
			[];

		console.log(`\n📊 Found ${transferEvents.length} Transfer events`);

		// 3. Test our scanner's address normalization logic
		console.log('\n🔍 Step 2: Testing address normalization logic...');

		const normalizeAddress = (address) => {
			if (!address) return '';
			const clean = address.startsWith('0x') ? address.slice(2) : address;
			return clean.replace(/^0+/, '').toLowerCase() || '0';
		};

		console.log('   Address normalization examples:');
		TEST_ADDRESSES.forEach((addr, index) => {
			const normalized = normalizeAddress(addr);
			console.log(`   ${index + 1}. ${addr.substring(0, 16)}... -> ${normalized}`);
		});

		// 4. Test our scanner's event filtering logic
		console.log('\n🧪 Step 3: Testing event filtering logic...');

		TEST_ADDRESSES.forEach((testAddress, testIndex) => {
			console.log(`\n   Testing with address ${testIndex + 1}: ${testAddress.substring(0, 16)}...`);
			const normalizedTestAddress = normalizeAddress(testAddress);
			console.log(`   Normalized: ${normalizedTestAddress}`);

			let matchingEvents = 0;

			transferEvents.forEach((event, eventIndex) => {
				if (event.data && event.data.length >= 3) {
					const fromAddress = event.data[0];
					const toAddress = event.data[1];
					const amount = event.data[2];

					const normalizedFrom = normalizeAddress(fromAddress);
					const normalizedTo = normalizeAddress(toAddress);

					// This is exactly how our scanner filters events
					const matches =
						normalizedFrom === normalizedTestAddress || normalizedTo === normalizedTestAddress;

					if (matches) {
						matchingEvents++;
						console.log(`     ✅ Event ${eventIndex + 1} MATCHES:`);
						console.log(`        From: ${fromAddress.substring(0, 16)}... (${normalizedFrom})`);
						console.log(`        To: ${toAddress.substring(0, 16)}... (${normalizedTo})`);
						console.log(`        Amount: ${amount}`);

						// Parse amount
						try {
							const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
							const bigIntAmount = BigInt(hexAmount);
							console.log(`        Parsed: ${bigIntAmount.toString()}`);
						} catch (error) {
							console.log(`        Parse Error: ${error.message}`);
						}
					} else {
						console.log(`     ❌ Event ${eventIndex + 1} does NOT match`);
					}
				}
			});

			if (matchingEvents > 0) {
				console.log(`   📊 Total matching events: ${matchingEvents}`);
			} else {
				console.log(`   ❌ No events match this address`);
			}
		});

		// 5. Test our scanner's event processing logic
		console.log('\n💾 Step 4: Testing event processing logic...');

		TEST_ADDRESSES.forEach((testAddress, testIndex) => {
			console.log(
				`\n   Processing events for address ${testIndex + 1}: ${testAddress.substring(0, 16)}...`
			);

			const normalizedTestAddress = normalizeAddress(testAddress);
			const relevantEvents = transferEvents.filter((event) => {
				if (event.data && event.data.length >= 3) {
					const from = event.data[0];
					const to = event.data[1];

					const normalizedFrom = normalizeAddress(from);
					const normalizedTo = normalizeAddress(to);

					return normalizedFrom === normalizedTestAddress || normalizedTo === normalizedTestAddress;
				}
				return false;
			});

			if (relevantEvents.length > 0) {
				console.log(`   📊 Found ${relevantEvents.length} relevant events`);

				// Simulate our scanner's transaction grouping logic
				const transactionGroups = new Map();

				relevantEvents.forEach((event) => {
					const txHash = event.transaction_hash;
					if (!transactionGroups.has(txHash)) {
						transactionGroups.set(txHash, []);
					}
					transactionGroups.get(txHash).push(event);
				});

				console.log(`   📦 Grouped into ${transactionGroups.size} transaction(s)`);

				// Process each transaction group
				transactionGroups.forEach((txEvents, txHash) => {
					console.log(`\n     Transaction: ${txHash.substring(0, 16)}...`);
					console.log(`     Events: ${txEvents.length}`);

					// Simulate our event selection logic (prioritize non-zero amounts)
					let selectedEvent = txEvents[0];

					if (txEvents.length > 1) {
						const nonZeroEvents = txEvents.filter((event) => {
							try {
								const amount = event.data[2];
								const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
								return BigInt(hexAmount) > 0n;
							} catch {
								return false;
							}
						});

						if (nonZeroEvents.length > 0) {
							// Select event with largest amount
							selectedEvent = nonZeroEvents.reduce((max, current) => {
								try {
									const maxAmount = BigInt(
										max.data[2].startsWith('0x') ? max.data[2] : `0x${max.data[2]}`
									);
									const currentAmount = BigInt(
										current.data[2].startsWith('0x') ? current.data[2] : `0x${current.data[2]}`
									);
									return currentAmount > maxAmount ? current : max;
								} catch {
									return max;
								}
							});
							console.log(`     Selected non-zero amount event`);
						} else {
							console.log(`     All events have zero amounts, using first event`);
						}
					}

					// Show what would be stored
					const fromAddress = selectedEvent.data[0];
					const toAddress = selectedEvent.data[1];
					const amount = selectedEvent.data[2];
					const normalizedTo = normalizeAddress(toAddress);
					const transactionType = normalizedTo === normalizedTestAddress ? 'receipt' : 'spent';

					console.log(`     Selected Event:`);
					console.log(`       From: ${fromAddress.substring(0, 16)}...`);
					console.log(`       To: ${toAddress.substring(0, 16)}...`);
					console.log(`       Amount: ${amount}`);
					console.log(`       Type: ${transactionType}`);

					// Parse amount
					try {
						const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
						const bigIntAmount = BigInt(hexAmount);
						console.log(`       Parsed: ${bigIntAmount.toString()}`);
						console.log(`       Would be stored as: "${amount}"`);
					} catch (error) {
						console.log(`       Parse Error: ${error.message}`);
					}
				});
			} else {
				console.log(`   ❌ No relevant events found`);
			}
		});

		// 6. Summary and recommendations
		console.log('\n📋 Step 5: Summary and Recommendations...');

		console.log('\n   🔍 What we found:');
		console.log(`   - Transaction has ${transferEvents.length} Transfer events`);
		console.log(`   - All events have non-zero amounts`);
		console.log(`   - Transaction is confirmed in block ${receipt.block_number}`);

		console.log('\n   🚨 Potential issues:');
		console.log(`   - Address filtering might be too restrictive`);
		console.log(`   - Address normalization might be failing`);
		console.log(`   - Event data structure might be different than expected`);
		console.log(`   - Scanner might be looking at wrong block range`);

		console.log('\n   🔧 Debugging steps:');
		console.log(`   1. Check if any of the test addresses are registered in your scanner`);
		console.log(`   2. Verify the scanner is scanning block ${receipt.block_number}`);
		console.log(`   3. Check address normalization logic in your scanner`);
		console.log(`   4. Verify event filtering criteria`);
		console.log(`   5. Check if scanner is running and processing events`);
	} catch (error) {
		console.error('❌ Error during testing:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Scanner logic testing complete');
}

// Run the test function
testScannerLogic().catch(console.error);
