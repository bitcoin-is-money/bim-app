#!/usr/bin/env node

/**
 * Comprehensive Transaction Debug Script
 *
 * This script handles edge cases where transactions might appear pending
 * but actually have receipts and events available.
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

async function debugTransactionComprehensive() {
	console.log('🚀 Comprehensive Transaction Debug Script');
	console.log('='.repeat(50));
	console.log(`Target TX: ${TARGET_TX_HASH}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// 1. Check transaction details
		console.log('\n🔍 Step 1: Checking transaction details...');
		let tx;
		try {
			tx = await provider.getTransaction(TARGET_TX_HASH);
			console.log('✅ Transaction found');
			console.log(`   Block: ${tx.block_number || 'Pending'}`);
			console.log(`   Status: ${tx.status || 'Unknown'}`);
			console.log(`   Type: ${tx.type || 'Unknown'}`);
			console.log(`   Version: ${tx.version || 'Unknown'}`);

			if (tx.block_number) {
				console.log(`   ✅ Transaction is confirmed in block ${tx.block_number}`);
			} else {
				console.log(`   ⏳ Transaction appears pending (no block number)`);
			}
		} catch (error) {
			console.log('❌ Failed to get transaction:', error.message);
		}

		// 2. Check transaction receipt (this might work even if transaction appears pending)
		console.log('\n📋 Step 2: Checking transaction receipt...');
		let receipt;
		try {
			receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
			console.log('✅ Receipt found');
			console.log(`   Events: ${receipt.events?.length || 0}`);
			console.log(`   Status: ${receipt.status || 'Unknown'}`);
			console.log(`   Block Hash: ${receipt.block_hash || 'N/A'}`);
			console.log(`   Block Number: ${receipt.block_number || 'N/A'}`);

			if (receipt.block_number && receipt.block_number !== tx?.block_number) {
				console.log(
					`   ⚠️  Receipt block number (${receipt.block_number}) differs from transaction block number (${tx?.block_number || 'Pending'})`
				);
			}
		} catch (error) {
			console.log('❌ Failed to get receipt:', error.message);
		}

		// 3. Analyze all events in the receipt
		if (receipt && receipt.events && receipt.events.length > 0) {
			console.log('\n📊 Step 3: Analyzing all events in receipt...');

			receipt.events.forEach((event, index) => {
				console.log(`\n   Event ${index + 1}:`);
				console.log(`     Keys: ${event.keys?.join(', ') || 'None'}`);
				console.log(`     Data: ${event.data?.join(', ') || 'None'}`);
				console.log(`     From: ${event.from_address || 'N/A'}`);
				console.log(`     Event Index: ${event.event_index || 'N/A'}`);

				// Check if this is a Transfer event
				const isTransferEvent = event.keys && event.keys.includes(TRANSFER_EVENT_KEY);
				console.log(`     Is Transfer Event: ${isTransferEvent ? 'YES' : 'NO'}`);

				if (isTransferEvent && event.data && event.data.length >= 3) {
					const fromAddress = event.data[0];
					const toAddress = event.data[1];
					const rawAmount = event.data[2];

					console.log(`     Transfer Details:`);
					console.log(`       From: ${fromAddress}`);
					console.log(`       To: ${toAddress}`);
					console.log(`       Amount: ${rawAmount}`);

					// Parse amount
					try {
						const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
						const bigIntAmount = BigInt(hexAmount);
						console.log(`       Parsed: ${bigIntAmount.toString()}`);
						console.log(`       Is Zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);

						// Check for potential issues
						if (bigIntAmount === 0n) {
							console.log(`       ⚠️  ZERO AMOUNT - This might be the issue!`);
						}
						if (rawAmount === '0x0' || rawAmount === '0') {
							console.log(`       ⚠️  EXPLICIT ZERO - Amount is explicitly zero`);
						}
					} catch (error) {
						console.log(`       ❌ Parse Error: ${error.message}`);
					}
				}
			});
		}

		// 4. Try to get events from the block if we have a block number
		if (receipt && receipt.block_number) {
			console.log('\n📡 Step 4: Fetching Transfer events from block...');
			try {
				const eventsResponse = await provider.getEvents({
					from_block: { block_number: receipt.block_number },
					to_block: { block_number: receipt.block_number },
					keys: [[TRANSFER_EVENT_KEY]],
					chunk_size: 1000
				});

				console.log(
					`✅ Found ${eventsResponse.events.length} Transfer events in block ${receipt.block_number}`
				);

				// Filter for our transaction
				const ourTxEvents = eventsResponse.events.filter(
					(event) => event.transaction_hash === TARGET_TX_HASH
				);

				console.log(`📊 Found ${ourTxEvents.length} Transfer events for our transaction`);

				if (ourTxEvents.length > 0) {
					console.log('\n   Our transaction Transfer events:');
					ourTxEvents.forEach((event, index) => {
						console.log(`\n     Event ${index + 1}:`);
						console.log(`       TX Hash: ${event.transaction_hash}`);
						console.log(`       Block: ${event.block_number}`);
						console.log(`       Contract: ${event.from_address}`);

						if (event.data && event.data.length >= 3) {
							const from = event.data[0];
							const to = event.data[1];
							const amount = event.data[2];

							console.log(`       From: ${from}`);
							console.log(`       To: ${to}`);
							console.log(`       Amount: ${amount}`);

							// Parse amount
							try {
								const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
								const bigIntAmount = BigInt(hexAmount);
								console.log(`       Parsed: ${bigIntAmount.toString()}`);
								console.log(`       Is Zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
							} catch (error) {
								console.log(`       Parse Error: ${error.message}`);
							}
						}
					});
				}
			} catch (error) {
				console.log('❌ Failed to fetch block events:', error.message);
			}
		}

		// 5. Simulate our blockchain scanner logic
		console.log('\n🧪 Step 5: Simulating our blockchain scanner logic...');

		if (receipt && receipt.events) {
			// Find Transfer events
			const transferEvents = receipt.events.filter(
				(event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)
			);

			console.log(`   Found ${transferEvents.length} Transfer events in receipt`);

			if (transferEvents.length > 0) {
				console.log('\n   What our scanner would process:');

				transferEvents.forEach((event, index) => {
					if (event.data && event.data.length >= 3) {
						const fromAddress = event.data[0];
						const toAddress = event.data[1];
						const rawAmount = event.data[2];

						console.log(`\n     Event ${index + 1}:`);
						console.log(`       From: ${fromAddress}`);
						console.log(`       To: ${toAddress}`);
						console.log(`       Raw Amount: "${rawAmount}"`);

						// Simulate our parsing logic
						try {
							const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
							const bigIntAmount = BigInt(hexAmount);

							console.log(`       Parsed Amount: "${rawAmount}"`);
							console.log(`       BigInt Value: ${bigIntAmount.toString()}`);
							console.log(`       Would be stored as: "${rawAmount}"`);

							if (bigIntAmount === 0n) {
								console.log(
									`       ⚠️  ISSUE: Amount is zero - this explains why scanning isn't working!`
								);
							}
						} catch (error) {
							console.log(`       Parse Error: ${error.message}`);
						}
					}
				});
			}
		}

		// 6. Check for potential issues
		console.log('\n🔍 Step 6: Potential Issues Analysis...');

		if (receipt && receipt.events) {
			const transferEvents = receipt.events.filter(
				(event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)
			);

			if (transferEvents.length === 0) {
				console.log(
					'   ❌ No Transfer events found - transaction is not a standard ERC-20 transfer'
				);
			} else {
				const zeroAmountEvents = transferEvents.filter((event) => {
					if (event.data && event.data.length >= 3) {
						try {
							const amount = event.data[2];
							const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
							return BigInt(hexAmount) === 0n;
						} catch {
							return false;
						}
					}
					return false;
				});

				if (zeroAmountEvents.length > 0) {
					console.log(`   ⚠️  Found ${zeroAmountEvents.length} Transfer events with zero amounts`);
					console.log('   This could explain why the amount is not being picked up correctly');
				}

				const nonZeroAmountEvents = transferEvents.filter((event) => {
					if (event.data && event.data.length >= 3) {
						try {
							const amount = event.data[2];
							const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
							return BigInt(hexAmount) > 0n;
						} catch {
							return false;
						}
					}
					return false;
				});

				if (nonZeroAmountEvents.length > 0) {
					console.log(
						`   ✅ Found ${nonZeroAmountEvents.length} Transfer events with non-zero amounts`
					);
					console.log('   These should be picked up by our scanner');
				}
			}
		}

		// 7. Recommendations
		console.log('\n💡 Step 7: Recommendations...');

		if (receipt && receipt.events) {
			const transferEvents = receipt.events.filter(
				(event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)
			);

			if (transferEvents.length === 0) {
				console.log('   📋 No Transfer events found:');
				console.log('      - This transaction is not a standard ERC-20 transfer');
				console.log("      - Check if it's a different type of transaction");
				console.log('      - Look for other event types that might contain amount information');
			} else {
				const hasZeroAmounts = transferEvents.some((event) => {
					if (event.data && event.data.length >= 3) {
						try {
							const amount = event.data[2];
							const hexAmount = amount.startsWith('0x') ? amount : `0x${amount}`;
							return BigInt(hexAmount) === 0n;
						} catch {
							return false;
						}
					}
					return false;
				});

				if (hasZeroAmounts) {
					console.log('   📋 Zero amount Transfer events found:');
					console.log('      - This explains why the amount is not being picked up');
					console.log('      - The transaction might be a "transfer" with 0 amount');
					console.log('      - Check if this is intentional or an error');
					console.log('      - Consider filtering out zero-amount transfers in your scanner');
				} else {
					console.log('   📋 Non-zero amount Transfer events found:');
					console.log('      - Amounts should be picked up correctly');
					console.log('      - Check your scanner configuration');
					console.log('      - Verify address filtering logic');
				}
			}
		}
	} catch (error) {
		console.error('❌ Error during debugging:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Comprehensive analysis complete');
}

// Run the debug function
debugTransactionComprehensive().catch(console.error);
