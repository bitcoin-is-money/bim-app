#!/usr/bin/env node

/**
 * Specific Transaction Debug Script
 *
 * This script specifically analyzes transaction 0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196
 * to debug blockchain scanning issues.
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

async function debugSpecificTransaction() {
	console.log('🚀 Debugging Specific Transaction');
	console.log('='.repeat(50));
	console.log(`Target TX: ${TARGET_TX_HASH}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// 1. Get transaction details
		console.log('\n🔍 Step 1: Fetching transaction details...');
		const tx = await provider.getTransaction(TARGET_TX_HASH);
		console.log('✅ Transaction found');
		console.log(`   Block: ${tx.block_number || 'Pending'}`);
		console.log(`   Status: ${tx.status || 'Unknown'}`);
		console.log(`   Type: ${tx.type || 'Unknown'}`);

		if (!tx.block_number) {
			console.log('❌ Transaction is pending, cannot analyze events');
			return;
		}

		// 2. Get transaction receipt
		console.log('\n📋 Step 2: Fetching transaction receipt...');
		const receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
		console.log('✅ Receipt found');
		console.log(`   Total events: ${receipt.events?.length || 0}`);

		if (receipt.events && receipt.events.length > 0) {
			console.log('\n📊 All events in transaction:');
			receipt.events.forEach((event, index) => {
				console.log(`   Event ${index + 1}:`);
				console.log(`     Keys: ${event.keys?.join(', ') || 'None'}`);
				console.log(`     Data: ${event.data?.join(', ') || 'None'}`);
				console.log(`     From: ${event.from_address || 'N/A'}`);
			});
		}

		// 3. Get Transfer events specifically for this block
		console.log('\n📡 Step 3: Fetching Transfer events for the block...');
		const eventsResponse = await provider.getEvents({
			from_block: { block_number: tx.block_number },
			to_block: { block_number: tx.block_number },
			keys: [[TRANSFER_EVENT_KEY]],
			chunk_size: 1000
		});

		console.log(
			`✅ Found ${eventsResponse.events.length} Transfer events in block ${tx.block_number}`
		);

		// 4. Filter events for our specific transaction
		const ourTxEvents = eventsResponse.events.filter(
			(event) => event.transaction_hash === TARGET_TX_HASH
		);

		console.log(`📊 Found ${ourTxEvents.length} Transfer events for our transaction`);

		// 5. Analyze each Transfer event
		if (ourTxEvents.length > 0) {
			console.log('\n🔍 Step 4: Analyzing Transfer events...');

			ourTxEvents.forEach((event, index) => {
				console.log(`\n   Transfer Event ${index + 1}:`);
				console.log(`   Transaction Hash: ${event.transaction_hash}`);
				console.log(`   Block Number: ${event.block_number}`);
				console.log(`   Contract Address: ${event.from_address}`);

				if (event.data && event.data.length >= 3) {
					const fromAddress = event.data[0];
					const toAddress = event.data[1];
					const rawAmount = event.data[2];

					console.log(`   From Address: ${fromAddress}`);
					console.log(`   To Address: ${toAddress}`);
					console.log(`   Raw Amount: ${rawAmount}`);

					// Parse amount
					try {
						const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
						const bigIntAmount = BigInt(hexAmount);
						console.log(`   Parsed Amount: ${rawAmount}`);
						console.log(`   BigInt Value: ${bigIntAmount.toString()}`);
						console.log(`   Is Zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
					} catch (error) {
						console.log(`   ❌ Parse Error: ${error.message}`);
					}

					// Show normalized addresses
					const normalizeAddress = (addr) => {
						if (!addr) return '';
						const clean = addr.startsWith('0x') ? addr.slice(2) : addr;
						return clean.replace(/^0+/, '').toLowerCase() || '0';
					};

					const normalizedFrom = normalizeAddress(fromAddress);
					const normalizedTo = normalizeAddress(toAddress);
					console.log(`   Normalized From: ${normalizedFrom}`);
					console.log(`   Normalized To: ${normalizedTo}`);
				} else {
					console.log(`   ❌ Invalid event data structure: ${JSON.stringify(event.data)}`);
				}
			});

			// 6. Simulate what our scanner would store
			console.log('\n💾 Step 5: Simulating our scanner logic...');

			ourTxEvents.forEach((event, index) => {
				if (event.data && event.data.length >= 3) {
					const amount = event.data[2];
					const fromAddress = event.data[0];
					const toAddress = event.data[1];

					console.log(`   Event ${index + 1}:`);
					console.log(`     Amount: "${amount}"`);
					console.log(`     From: ${fromAddress}`);
					console.log(`     To: ${toAddress}`);
					console.log(`     Would be stored as: "${amount}"`);
				}
			});
		} else {
			console.log('❌ No Transfer events found for our transaction');
			console.log('   This might indicate the transaction is not a standard ERC-20 transfer');
		}

		// 7. Check if there are any other event types
		console.log('\n🔍 Step 6: Checking for other event types...');
		const nonTransferEvents =
			receipt.events?.filter((event) => event.keys && !event.keys.includes(TRANSFER_EVENT_KEY)) ||
			[];

		if (nonTransferEvents.length > 0) {
			console.log(`Found ${nonTransferEvents.length} non-Transfer events:`);
			nonTransferEvents.forEach((event, index) => {
				console.log(`   Event ${index + 1}: ${event.keys?.join(', ') || 'No keys'}`);
				console.log(`     Data: ${event.data?.join(', ') || 'No data'}`);
			});
		} else {
			console.log('No non-Transfer events found');
		}
	} catch (error) {
		console.error('❌ Error during debugging:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Debug analysis complete');
}

// Run the debug function
debugSpecificTransaction().catch(console.error);
