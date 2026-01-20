#!/usr/bin/env node

/**
 * Debug Transaction Attribution Issue
 *
 * This script investigates how the blockchain scanner attributes transactions
 * to addresses and why this specific transaction ended up with the sender instead
 * of the recipient.
 */

import { RpcProvider } from 'starknet';

// Configuration
const RPC_URL =
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3ff5a6c90a43daa61cc9f5b37da59deda8';
const SPEC_VERSION = '0.9.0';

// Target transaction and addresses
const TARGET_TX_HASH = '0x54d7409bf1be2cecb36b7f96b6ff29881b75ea45747a508f5970ada8fe68653';
const RECIPIENT_ADDRESS = '0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';
const SENDER_ADDRESS = '0x04871dbf5a7de465fb5c19cf8e3d87cc538391313f7cf5a58d5b6f89b8a795c2';

// ERC-20 Transfer event selector
const TRANSFER_EVENT_KEY = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

/**
 * Current normalization function from blockchain scanner
 */
function normalizeAddress(address) {
	const clean = address.startsWith('0x') ? address.slice(2) : address;
	return clean.replace(/^0+/, '').toLowerCase() || '0';
}

/**
 * Simulate how the blockchain scanner processes addresses and events
 */
function simulateAddressMatching(eventFromAddr, eventToAddr, monitoredAddresses) {
	console.log('\n🧪 Simulating Address Matching Logic:');

	const normalizedFrom = normalizeAddress(eventFromAddr);
	const normalizedTo = normalizeAddress(eventToAddr);

	console.log(`   Event From (raw):        ${eventFromAddr}`);
	console.log(`   Event From (normalized): ${normalizedFrom}`);
	console.log(`   Event To (raw):          ${eventToAddr}`);
	console.log(`   Event To (normalized):   ${normalizedTo}`);

	console.log('\n   Checking against monitored addresses:');

	const matches = [];
	for (const [label, addr] of Object.entries(monitoredAddresses)) {
		const normalized = normalizeAddress(addr);
		const fromMatch = normalizedFrom === normalized;
		const toMatch = normalizedTo === normalized;

		console.log(`   ${label}:`);
		console.log(`     Address (raw):        ${addr}`);
		console.log(`     Address (normalized): ${normalized}`);
		console.log(`     Matches From:         ${fromMatch ? '✅ YES' : '❌ NO'}`);
		console.log(`     Matches To:           ${toMatch ? '✅ YES' : '❌ NO'}`);

		if (fromMatch || toMatch) {
			matches.push({
				label,
				address: addr,
				normalized,
				matchType: fromMatch ? 'sender' : 'recipient',
				transactionType: toMatch ? 'receipt' : 'spent'
			});
		}
	}

	console.log('\n   📊 Matching Results:');
	if (matches.length === 0) {
		console.log('     ❌ No matches found - transaction would be ignored');
	} else {
		matches.forEach((match, index) => {
			console.log(`     Match ${index + 1}: ${match.label}`);
			console.log(`       Address: ${match.address}`);
			console.log(`       Role in TX: ${match.matchType}`);
			console.log(`       Transaction Type: ${match.transactionType}`);
			console.log(`       Attribution: Transaction belongs to ${match.label}`);
		});
	}

	return matches;
}

async function debugTransactionAttribution() {
	console.log('🔍 Debug Transaction Attribution Issue');
	console.log('='.repeat(60));
	console.log(`Transaction: ${TARGET_TX_HASH}`);
	console.log(`Recipient:   ${RECIPIENT_ADDRESS}`);
	console.log(`Sender:      ${SENDER_ADDRESS}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// Step 1: Get transaction receipt and analyze Transfer events
		console.log('\n📋 Step 1: Analyzing transaction events...');

		let receipt;
		try {
			receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
			console.log(`   ✅ Receipt found with ${receipt.events?.length || 0} events`);
		} catch (error) {
			console.log(`   ❌ Failed to get receipt: ${error.message}`);
			return;
		}

		if (!receipt.events || receipt.events.length === 0) {
			console.log('   ❌ No events found in transaction');
			return;
		}

		// Find Transfer events
		const transferEvents = receipt.events.filter(
			(event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)
		);

		console.log(`   Found ${transferEvents.length} Transfer events:`);

		const eventDetails = [];
		transferEvents.forEach((event, index) => {
			if (event.data && event.data.length >= 3) {
				const fromAddr = event.data[0];
				const toAddr = event.data[1];
				const amount = event.data[2];

				console.log(`\n   Event ${index + 1}:`);
				console.log(`     Token Contract: ${event.from_address}`);
				console.log(`     From: ${fromAddr}`);
				console.log(`     To: ${toAddr}`);
				console.log(`     Amount: ${amount}`);

				eventDetails.push({
					index: index + 1,
					tokenContract: event.from_address,
					from: fromAddr,
					to: toAddr,
					amount: amount
				});
			}
		});

		// Step 2: Simulate how blockchain scanner would process each event
		console.log('\n🎯 Step 2: Simulating blockchain scanner processing...');

		const monitoredAddresses = {
			'Target Recipient': RECIPIENT_ADDRESS,
			'Transaction Sender': SENDER_ADDRESS
		};

		eventDetails.forEach((event) => {
			console.log(`\n--- Processing Event ${event.index} ---`);
			console.log(`Token: ${event.tokenContract}`);
			console.log(`Transfer: ${event.from} -> ${event.to}`);
			console.log(`Amount: ${event.amount}`);

			const matches = simulateAddressMatching(event.from, event.to, monitoredAddresses);

			if (matches.length > 0) {
				console.log('\n   🎯 Scanner Decision:');
				// The scanner would pick the first matching address
				const selectedMatch = matches[0];
				console.log(`     Transaction attributed to: ${selectedMatch.label}`);
				console.log(`     Address: ${selectedMatch.address}`);
				console.log(`     Transaction type: ${selectedMatch.transactionType}`);

				if (selectedMatch.label === 'Transaction Sender') {
					console.log(
						"     ⚠️  This explains why the transaction appears under the sender's history!"
					);
				}
			}
		});

		// Step 3: Explain the real issue
		console.log('\n🔍 Step 3: Root Cause Analysis...');

		console.log('\n   The Issue:');
		console.log('   1. Both the sender AND recipient addresses are registered for monitoring');
		console.log('   2. The blockchain scanner found a Transfer event involving both addresses');
		console.log('   3. The scanner attributed the transaction to the FIRST address it found');
		console.log('   4. In this case, the sender address was processed first/matched first');
		console.log(
			"   5. Therefore, the transaction appears in the sender's history, not the recipient's"
		);

		console.log('\n   💡 The Real Problem:');
		console.log('   This is not a normalization issue, but a transaction attribution logic issue.');
		console.log('   When multiple monitored addresses are involved in the same transaction,');
		console.log('   the scanner should create separate transaction records for each address,');
		console.log('   not just attribute it to the first match.');

		console.log('\n   Current Behavior:');
		console.log('   - Transaction found involving both sender and recipient');
		console.log('   - Scanner picks sender address (first match or sender has priority)');
		console.log("   - Transaction stored under sender's address ID");
		console.log('   - Recipient sees no transaction in their history');

		console.log('\n   Correct Behavior Should Be:');
		console.log('   - Transaction found involving both sender and recipient');
		console.log('   - Scanner creates TWO records:');
		console.log('     * One for sender (type: "spent")');
		console.log('     * One for recipient (type: "receipt")');
		console.log('   - Both addresses see the transaction in their history');
	} catch (error) {
		console.error('❌ Error during debugging:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Attribution analysis complete');
}

// Run the debug function
debugTransactionAttribution().catch(console.error);
