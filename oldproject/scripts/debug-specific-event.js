#!/usr/bin/env node

/**
 * Debug Specific Event Script
 *
 * This script fetches and analyzes a specific event by block number,
 * transaction index, and event index to understand why it's not being processed.
 */

import { RpcProvider } from 'starknet';

// Configuration
const RPC_URL =
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3cbbdf/rpc/v0_8';
const WBTC_CONTRACT_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const TRANSFER_EVENT_KEY = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

class SpecificEventDebugger {
	constructor() {
		this.provider = new RpcProvider({ nodeUrl: RPC_URL });
	}

	normalizeAddress(address) {
		if (!address) return '';
		let normalized = address.toLowerCase();
		if (normalized.startsWith('0x')) {
			normalized = normalized.substring(2);
		}
		// Remove leading zeros but keep at least one character
		normalized = normalized.replace(/^0+/, '') || '0';
		return normalized;
	}

	async debugSpecificEvent(blockNumber, txIndex, eventIndex) {
		console.log('🔍 Debugging Specific Event');
		console.log('='.repeat(50));
		console.log(`Event ID: ${blockNumber}_${txIndex}_${eventIndex}`);
		console.log(`Block: ${blockNumber}`);
		console.log(`Transaction Index: ${txIndex}`);
		console.log(`Event Index: ${eventIndex}`);
		console.log('');

		try {
			// Step 1: Get block details
			console.log('📋 Step 1: Getting block details...');
			const block = await this.provider.getBlock(blockNumber);

			if (!block) {
				console.log('❌ Block not found');
				return;
			}

			console.log(`   Block Hash: ${block.block_hash}`);
			console.log(`   Timestamp: ${block.timestamp}`);
			console.log(`   Transactions: ${block.transactions?.length || 0}`);
			console.log('');

			// Step 2: Get specific transaction
			if (!block.transactions || txIndex >= block.transactions.length) {
				console.log(
					`❌ Transaction index ${txIndex} not found in block (has ${block.transactions?.length || 0} transactions)`
				);
				return;
			}

			const txHash = block.transactions[txIndex];
			console.log(`📋 Step 2: Getting transaction ${txIndex}...`);
			console.log(`   Transaction Hash: ${txHash}`);

			// Get transaction receipt
			const receipt = await this.provider.getTransactionReceipt(txHash);
			if (!receipt) {
				console.log('❌ Receipt not found');
				return;
			}

			console.log(`   Events in Receipt: ${receipt.events?.length || 0}`);
			console.log('');

			// Step 3: Get specific event
			if (!receipt.events || eventIndex >= receipt.events.length) {
				console.log(
					`❌ Event index ${eventIndex} not found (has ${receipt.events?.length || 0} events)`
				);
				return;
			}

			const targetEvent = receipt.events[eventIndex];
			console.log(`📋 Step 3: Analyzing target event ${eventIndex}...`);
			console.log(`   Event Keys: ${targetEvent.keys?.join(', ') || 'None'}`);
			console.log(`   Event Data: ${targetEvent.data?.join(', ') || 'None'}`);
			console.log(`   From Address: ${targetEvent.from_address || 'N/A'}`);
			console.log('');

			// Step 4: Check if it's a Transfer event
			const isTransferEvent = targetEvent.keys && targetEvent.keys.includes(TRANSFER_EVENT_KEY);
			console.log(`📋 Step 4: Transfer event analysis...`);
			console.log(`   Is Transfer Event: ${isTransferEvent ? '✅ YES' : '❌ NO'}`);

			if (isTransferEvent) {
				console.log(`   Transfer Event Key: ${TRANSFER_EVENT_KEY}`);

				if (targetEvent.data && targetEvent.data.length >= 3) {
					const from = targetEvent.data[0];
					const to = targetEvent.data[1];
					const amount = targetEvent.data[2];

					console.log(`   From: ${from}`);
					console.log(`   To: ${to}`);
					console.log(`   Amount: ${amount}`);

					try {
						const bigIntAmount = BigInt(amount.startsWith('0x') ? amount : `0x${amount}`);
						console.log(`   Parsed Amount: ${bigIntAmount.toString()}`);
						console.log(`   Is Zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
					} catch (error) {
						console.log(`   Amount Parse Error: ${error.message}`);
					}
				}

				// Check if it's WBTC
				const isWbtc = targetEvent.from_address === WBTC_CONTRACT_ADDRESS;
				const isWbtcLowercase =
					targetEvent.from_address?.toLowerCase() === WBTC_CONTRACT_ADDRESS.toLowerCase();

				console.log(`   Contract Address: ${targetEvent.from_address}`);
				console.log(`   Expected WBTC: ${WBTC_CONTRACT_ADDRESS}`);
				console.log(`   Is WBTC (exact): ${isWbtc ? '✅ YES' : '❌ NO'}`);
				console.log(`   Is WBTC (case-insensitive): ${isWbtcLowercase ? '✅ YES' : '❌ NO'}`);
			}
			console.log('');

			// Step 5: Get all Transfer events in this block
			console.log('📋 Step 5: Getting all Transfer events in block...');
			const allEvents = await this.provider.getEvents({
				from_block: { block_number: blockNumber },
				to_block: { block_number: blockNumber },
				keys: [TRANSFER_EVENT_KEY],
				chunk_size: 1000
			});

			console.log(`   Total Transfer events in block: ${allEvents.events?.length || 0}`);

			// Find our specific transaction's events
			const txEvents = allEvents.events?.filter((event) => event.transaction_hash === txHash) || [];

			console.log(`   Transfer events for our transaction: ${txEvents.length}`);

			if (txEvents.length > 0) {
				console.log(`   Our transaction's Transfer events:`);
				txEvents.forEach((event, index) => {
					const isWbtc = event.from_address?.toLowerCase() === WBTC_CONTRACT_ADDRESS.toLowerCase();
					console.log(
						`     Event ${index}: ${event.from_address} - WBTC: ${isWbtc ? '✅' : '❌'} - Amount: ${event.data[2] || 'N/A'}`
					);
				});
			}
			console.log('');

			// Step 6: Simulate scanner address filtering
			console.log('📋 Step 6: Simulating scanner address filtering...');

			// You'll need to provide a target address to test filtering
			const targetAddress = process.argv[4]; // Optional 4th argument
			if (targetAddress) {
				console.log(`   Target Address: ${targetAddress}`);
				const normalizedTarget = this.normalizeAddress(targetAddress);
				console.log(`   Normalized Target: ${normalizedTarget}`);

				const matchingEvents = txEvents.filter((event) => {
					if (event.data && event.data.length >= 2) {
						const normalizedFrom = this.normalizeAddress(event.data[0]);
						const normalizedTo = this.normalizeAddress(event.data[1]);

						const matches =
							normalizedFrom === normalizedTarget || normalizedTo === normalizedTarget;
						if (matches) {
							console.log(
								`     ✅ Event matches: ${event.from_address} - From: ${normalizedFrom}, To: ${normalizedTo}`
							);
						}
						return matches;
					}
					return false;
				});

				console.log(`   Events matching target address: ${matchingEvents.length}`);
			} else {
				console.log(`   No target address provided for filtering test`);
			}
		} catch (error) {
			console.error('❌ Error debugging event:', error.message);
		}

		console.log('\n✨ Debug complete');
	}
}

// Main execution
async function main() {
	const eventId = process.argv[2];
	const targetAddress = process.argv[3]; // Optional

	if (!eventId) {
		console.error('❌ Please provide an event ID in format: blockNumber_txIndex_eventIndex');
		console.error('Usage: node scripts/debug-specific-event.js <eventId> [targetAddress]');
		console.error('Example: node scripts/debug-specific-event.js 1792490_15_0');
		process.exit(1);
	}

	const parts = eventId.split('_');
	if (parts.length !== 3) {
		console.error('❌ Invalid event ID format. Expected: blockNumber_txIndex_eventIndex');
		process.exit(1);
	}

	const blockNumber = parseInt(parts[0]);
	const txIndex = parseInt(parts[1]);
	const eventIndex = parseInt(parts[2]);

	if (isNaN(blockNumber) || isNaN(txIndex) || isNaN(eventIndex)) {
		console.error('❌ Invalid event ID. All parts must be numbers.');
		process.exit(1);
	}

	const eventDebugger = new SpecificEventDebugger();
	await eventDebugger.debugSpecificEvent(blockNumber, txIndex, eventIndex, targetAddress);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { SpecificEventDebugger };
