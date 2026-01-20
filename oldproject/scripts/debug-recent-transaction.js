#!/usr/bin/env node

/**
 * Debug Recent Transaction Script
 *
 * This script directly checks a transaction's status and events
 * to understand why it's not showing amounts after the WBTC fix.
 */

import { RpcProvider } from 'starknet';

// Configuration
const RPC_URL =
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3cbbdf/rpc/v0_8';
const WBTC_CONTRACT_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';

class RecentTransactionDebugger {
	constructor() {
		this.provider = new RpcProvider({ nodeUrl: RPC_URL });
	}

	normalizeAddress(address) {
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

	async debugTransaction(txHash) {
		console.log('🔍 Debugging Recent Transaction');
		console.log('='.repeat(50));
		console.log(`Transaction Hash: ${txHash}`);
		console.log(`WBTC Contract: ${WBTC_CONTRACT_ADDRESS}`);
		console.log('');

		try {
			// Step 1: Get transaction details
			console.log('📋 Step 1: Getting transaction details...');
			const tx = await this.provider.getTransaction(txHash);

			if (!tx) {
				console.log('❌ Transaction not found');
				return;
			}

			console.log(`   Transaction Type: ${tx.type}`);
			console.log(`   Version: ${tx.version}`);
			console.log(`   Block Number: ${tx.block_number || 'Pending'}`);
			console.log(`   Status: ${tx.status || 'Unknown'}`);
			console.log('');

			// Step 2: Get transaction receipt
			console.log('📋 Step 2: Getting transaction receipt...');
			const receipt = await this.provider.getTransactionReceipt(txHash);

			if (!receipt) {
				console.log('❌ Receipt not found');
				return;
			}

			console.log(`   Events Count: ${receipt.events?.length || 0}`);
			console.log(`   Block Hash: ${receipt.block_hash || 'N/A'}`);
			console.log(`   Block Number: ${receipt.block_number || 'N/A'}`);
			console.log(`   Status: ${receipt.status || 'Unknown'}`);
			console.log('');

			// Step 3: Analyze events
			if (receipt.events && receipt.events.length > 0) {
				console.log('📋 Step 3: Analyzing events...');

				const transferEvents = receipt.events.filter(
					(event) =>
						event.keys &&
						event.keys.includes('0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9')
				);

				console.log(`   Total Events: ${receipt.events.length}`);
				console.log(`   Transfer Events: ${transferEvents.length}`);
				console.log('');

				if (transferEvents.length > 0) {
					console.log('   Transfer Event Details:');
					transferEvents.forEach((event, index) => {
						console.log(`   Event ${index + 1}:`);
						console.log(`     Contract: ${event.from_address}`);
						const isWbtcExact = event.from_address === WBTC_CONTRACT_ADDRESS;
						const normalizedEventToken = this.normalizeAddress(event.from_address);
						const normalizedWbtcToken = this.normalizeAddress(WBTC_CONTRACT_ADDRESS);
						const isWbtcNormalized = normalizedEventToken === normalizedWbtcToken;
						console.log(`     Is WBTC (exact): ${isWbtcExact ? '✅ YES' : '❌ NO'}`);
						console.log(`     Is WBTC (normalized): ${isWbtcNormalized ? '✅ YES' : '❌ NO'}`);

						if (event.data && event.data.length >= 3) {
							const from = event.data[0];
							const to = event.data[1];
							const amount = event.data[2];

							console.log(`     From: ${from}`);
							console.log(`     To: ${to}`);
							console.log(`     Amount: ${amount}`);

							try {
								const bigIntAmount = BigInt(amount.startsWith('0x') ? amount : `0x${amount}`);
								console.log(`     Parsed Amount: ${bigIntAmount.toString()}`);
								console.log(`     Is Zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
							} catch (error) {
								console.log(`     Amount Parse Error: ${error.message}`);
							}
						}
						console.log('');
					});

					// Step 4: Simulate our scanner logic
					console.log('📋 Step 4: Simulating Scanner Logic...');
					this.simulateScannerLogic(transferEvents);
				} else {
					console.log('   ❌ No Transfer events found');
				}
			} else {
				console.log('   ❌ No events found in receipt');
			}

			// Step 5: Check if transaction is in a recent block
			if (receipt.block_number) {
				console.log('📋 Step 5: Checking block status...');
				try {
					const block = await this.provider.getBlock(receipt.block_number);
					if (block) {
						console.log(`   Block ${receipt.block_number} exists`);
						console.log(`   Block Hash: ${block.block_hash}`);
						console.log(`   Block Timestamp: ${block.timestamp}`);
					}
				} catch (error) {
					console.log(`   Error getting block: ${error.message}`);
				}
			}
		} catch (error) {
			console.error('❌ Error debugging transaction:', error.message);
		}

		console.log('\n✨ Debug complete');
	}

	simulateScannerLogic(transferEvents) {
		console.log('   Simulating our updated scanner logic...');

		if (transferEvents.length === 1) {
			const event = transferEvents[0];
			const isWbtcExact = event.from_address === WBTC_CONTRACT_ADDRESS;
			const normalizedEventToken = this.normalizeAddress(event.from_address);
			const normalizedWbtcToken = this.normalizeAddress(WBTC_CONTRACT_ADDRESS);
			const isWbtcNormalized = normalizedEventToken === normalizedWbtcToken;
			console.log(`   Single event found - Is WBTC (exact): ${isWbtcExact ? '✅ YES' : '❌ NO'}`);
			console.log(
				`   Single event found - Is WBTC (normalized): ${isWbtcNormalized ? '✅ YES' : '❌ NO'}`
			);

			if (event.data && event.data.length >= 3) {
				const amount = event.data[2];
				console.log(`   Amount: ${amount}`);
				console.log(`   Would be stored: ${amount}`);
			}
		} else if (transferEvents.length > 1) {
			console.log(`   Multiple events found (${transferEvents.length})`);

			// Find WBTC events (using address normalization)
			const wbtcEvents = transferEvents.filter((event) => {
				const normalizedEventToken = this.normalizeAddress(event.from_address);
				const normalizedWbtcToken = this.normalizeAddress(WBTC_CONTRACT_ADDRESS);
				return normalizedEventToken === normalizedWbtcToken;
			});

			console.log(`   WBTC events: ${wbtcEvents.length}`);

			if (wbtcEvents.length > 0) {
				// Select WBTC event with highest non-zero amount
				let selectedEvent = wbtcEvents[0];

				if (wbtcEvents.length > 1) {
					selectedEvent = wbtcEvents.reduce((max, current) => {
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
				}

				console.log(`   ✅ Selected WBTC event: ${selectedEvent.data[2]}`);
				console.log(`   Would be stored: ${selectedEvent.data[2]}`);
			} else {
				console.log(`   ❌ No WBTC events found, would fallback to amount-based selection`);
			}
		}
	}
}

// Main execution
async function main() {
	const txHash = process.argv[2];

	if (!txHash) {
		console.error('❌ Please provide a transaction hash');
		console.error('Usage: node scripts/debug-recent-transaction.js <tx_hash>');
		process.exit(1);
	}

	const txDebugger = new RecentTransactionDebugger();
	await txDebugger.debugTransaction(txHash);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { RecentTransactionDebugger };
