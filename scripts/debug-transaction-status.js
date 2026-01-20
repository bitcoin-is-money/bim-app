#!/usr/bin/env node

/**
 * Transaction Status Debug Script
 *
 * This script checks the status of a specific transaction and looks for
 * recent confirmed transactions to understand blockchain scanning issues.
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

async function debugTransactionStatus() {
	console.log('🚀 Transaction Status Debug Script');
	console.log('='.repeat(50));
	console.log(`Target TX: ${TARGET_TX_HASH}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// 1. Check current transaction status
		console.log('\n🔍 Step 1: Checking current transaction status...');
		let tx;
		try {
			tx = await provider.getTransaction(TARGET_TX_HASH);
			console.log('✅ Transaction found');
			console.log(`   Block: ${tx.block_number || 'Pending'}`);
			console.log(`   Status: ${tx.status || 'Unknown'}`);
			console.log(`   Type: ${tx.type || 'Unknown'}`);

			if (tx.block_number) {
				console.log(`   ✅ Transaction is confirmed in block ${tx.block_number}`);
			} else {
				console.log(`   ⏳ Transaction is still pending`);
			}
		} catch (error) {
			console.log('❌ Transaction not found or error occurred:', error.message);
			console.log('   This could mean:');
			console.log('   - Transaction is still in mempool');
			console.log('   - Transaction was dropped');
			console.log('   - Transaction hash is invalid');
		}

		// 2. Get latest block number
		console.log('\n📡 Step 2: Getting latest block information...');
		try {
			const latestBlock = await provider.getBlock('latest');
			console.log(`✅ Latest block: ${latestBlock.block_number}`);
			console.log(`   Timestamp: ${new Date(latestBlock.timestamp * 1000).toISOString()}`);

			if (tx && tx.block_number) {
				const confirmations = latestBlock.block_number - tx.block_number;
				console.log(`   Confirmations: ${confirmations}`);
				if (confirmations < 0) {
					console.log(
						`   ⚠️  Transaction block number (${tx.block_number}) is higher than latest block (${latestBlock.block_number})`
					);
				}
			}
		} catch (error) {
			console.log('❌ Failed to get latest block:', error.message);
		}

		// 3. Check if transaction is in mempool (pending)
		if (!tx || !tx.block_number) {
			console.log('\n⏳ Step 3: Transaction is pending, checking mempool...');
			console.log('   Note: Pending transactions cannot be analyzed for events yet');
			console.log('   They need to be mined into a block first');

			// Try to get transaction receipt (might work for some pending txs)
			try {
				const receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
				if (receipt) {
					console.log('   📋 Receipt available (transaction might be processing)');
					console.log(`   Events: ${receipt.events?.length || 0}`);
				}
			} catch (error) {
				console.log('   📋 No receipt available yet (transaction in mempool)');
			}
		}

		// 4. Look for recent Transfer events to understand scanning
		console.log('\n🔍 Step 4: Analyzing recent Transfer events for scanning context...');
		try {
			const latestBlock = await provider.getBlock('latest');
			const fromBlock = Math.max(0, latestBlock.block_number - 10); // Last 10 blocks

			console.log(
				`   Scanning blocks ${fromBlock} to ${latestBlock.block_number} for Transfer events...`
			);

			const eventsResponse = await provider.getEvents({
				from_block: { block_number: fromBlock },
				to_block: { block_number: latestBlock.block_number },
				keys: [[TRANSFER_EVENT_KEY]],
				chunk_size: 100
			});

			console.log(`   ✅ Found ${eventsResponse.events.length} Transfer events in recent blocks`);

			if (eventsResponse.events.length > 0) {
				console.log('\n   📊 Sample of recent Transfer events:');

				// Show first few events
				eventsResponse.events.slice(0, 5).forEach((event, index) => {
					console.log(`\n     Event ${index + 1}:`);
					console.log(`     TX Hash: ${event.transaction_hash.substring(0, 16)}...`);
					console.log(`     Block: ${event.block_number}`);
					console.log(`     Contract: ${event.from_address.substring(0, 16)}...`);

					if (event.data && event.data.length >= 3) {
						const from = event.data[0];
						const to = event.data[1];
						const amount = event.data[2];

						console.log(`     From: ${from.substring(0, 16)}...`);
						console.log(`     To: ${to.substring(0, 16)}...`);
						console.log(`     Amount: ${amount}`);

						// Parse amount
						try {
							const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
							const bigIntAmount = BigInt(hexAmount);
							console.log(`     Parsed: ${bigIntAmount.toString()}`);
							console.log(`     Is Zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
						} catch (error) {
							console.log(`     Parse Error: ${error.message}`);
						}
					}
				});

				if (eventsResponse.events.length > 5) {
					console.log(`\n     ... and ${eventsResponse.events.length - 5} more events`);
				}
			}
		} catch (error) {
			console.log('   ❌ Failed to fetch recent events:', error.message);
		}

		// 5. Recommendations
		console.log('\n💡 Step 5: Recommendations');

		if (!tx || !tx.block_number) {
			console.log('   📋 For pending transactions:');
			console.log('      - Wait for transaction to be mined into a block');
			console.log('      - Check transaction status periodically');
			console.log('      - Verify the transaction hash is correct');
			console.log('      - Check if the transaction was dropped from mempool');
		} else {
			console.log('   📋 For confirmed transactions:');
			console.log('      - Transaction is confirmed, events should be available');
			console.log('      - Run the full debug script to analyze events');
			console.log('      - Check if Transfer events are being emitted');
			console.log('      - Verify event data structure');
		}

		console.log('\n   🔧 General debugging tips:');
		console.log('      - Use "npm run debug:tx" once transaction is confirmed');
		console.log('      - Check RPC endpoint connectivity');
		console.log('      - Verify event selector is correct');
		console.log('      - Look for non-Transfer events in the transaction');
	} catch (error) {
		console.error('❌ Error during debugging:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Status analysis complete');
}

// Run the debug function
debugTransactionStatus().catch(console.error);
