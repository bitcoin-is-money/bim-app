#!/usr/bin/env node

/**
 * Transaction Debug Script
 *
 * This script analyzes a specific transaction to debug blockchain scanning issues.
 * It fetches the transaction directly from the blockchain and compares what our
 * scanner would pick up vs. what's actually there.
 *
 * Usage: node scripts/debug-transaction.js [transaction_hash]
 */

import { RpcProvider } from 'starknet';

// Configuration
const RPC_URL =
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3cbbdf/rpc/v0_8';
const SPEC_VERSION = '0.9.0';

// ERC-20 Transfer event selector (keccak256 of "Transfer(from,to,value)")
const TRANSFER_EVENT_KEY = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

// Default transaction hash to analyze
const DEFAULT_TX_HASH = '0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196';

class TransactionDebugger {
	constructor() {
		this.provider = new RpcProvider({
			nodeUrl: RPC_URL,
			specVersion: SPEC_VERSION
		});
	}

	/**
	 * Normalize address for comparison (remove 0x prefix and leading zeros)
	 * This matches the logic in our blockchain scanner
	 */
	normalizeAddress(address) {
		if (!address) return '';
		const clean = address.startsWith('0x') ? address.slice(2) : address;
		return clean.replace(/^0+/, '').toLowerCase() || '0';
	}

	/**
	 * Parse amount from hex string
	 * This matches the logic in our blockchain scanner
	 */
	parseAmount(rawAmount) {
		if (!rawAmount) return { parsed: '0', bigInt: 0n, error: 'Empty amount' };

		try {
			const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
			const bigIntAmount = BigInt(hexAmount);

			return {
				parsed: rawAmount,
				bigInt: bigIntAmount,
				error: null
			};
		} catch (error) {
			return {
				parsed: '0',
				bigInt: 0n,
				error: error.message
			};
		}
	}

	/**
	 * Fetch transaction details
	 */
	async fetchTransaction(txHash) {
		console.log(`\n🔍 Fetching transaction: ${txHash}`);

		try {
			const tx = await this.provider.getTransaction(txHash);
			console.log('✅ Transaction found');
			console.log(`   Block: ${tx.block_number || 'Pending'}`);
			console.log(`   Status: ${tx.status || 'Unknown'}`);
			console.log(`   Type: ${tx.type || 'Unknown'}`);

			return tx;
		} catch (error) {
			console.error('❌ Failed to fetch transaction:', error.message);
			return null;
		}
	}

	/**
	 * Fetch transaction receipt
	 */
	async fetchTransactionReceipt(txHash) {
		console.log(`\n📋 Fetching transaction receipt...`);

		try {
			const receipt = await this.provider.getTransactionReceipt(txHash);
			console.log('✅ Receipt found');
			console.log(`   Events: ${receipt.events?.length || 0}`);
			console.log(`   L1 gas: ${receipt.l1_gas_consumed || 'N/A'}`);
			console.log(`   L2 gas: ${receipt.l2_gas_consumed || 'N/A'}`);

			return receipt;
		} catch (error) {
			console.error('❌ Failed to fetch receipt:', error.message);
			return null;
		}
	}

	/**
	 * Fetch events for a specific block range
	 */
	async fetchEventsForBlock(blockNumber) {
		console.log(`\n📡 Fetching events for block ${blockNumber}...`);

		try {
			const response = await this.provider.getEvents({
				from_block: { block_number: blockNumber },
				to_block: { block_number: blockNumber },
				keys: [[TRANSFER_EVENT_KEY]],
				chunk_size: 1000
			});

			console.log(`✅ Found ${response.events.length} Transfer events in block ${blockNumber}`);
			return response.events;
		} catch (error) {
			console.error('❌ Failed to fetch events:', error.message);
			return [];
		}
	}

	/**
	 * Analyze Transfer events
	 */
	analyzeTransferEvents(events, txHash) {
		console.log(`\n🔍 Analyzing Transfer events for transaction ${txHash}...`);

		if (!events || events.length === 0) {
			console.log('❌ No Transfer events found');
			return [];
		}

		const transferEvents = events.filter((event) => event.transaction_hash === txHash);

		console.log(`📊 Found ${transferEvents.length} Transfer events for this transaction`);

		transferEvents.forEach((event, index) => {
			console.log(`\n   Event ${index + 1}:`);
			console.log(`   Transaction Hash: ${event.transaction_hash}`);
			console.log(`   Block Number: ${event.block_number}`);
			console.log(`   Event Index: ${event.event_index || 'N/A'}`);
			console.log(`   Contract Address: ${event.from_address}`);

			if (event.data && event.data.length >= 3) {
				const fromAddress = event.data[0];
				const toAddress = event.data[1];
				const rawAmount = event.data[2];

				console.log(`   From Address: ${fromAddress}`);
				console.log(`   To Address: ${toAddress}`);
				console.log(`   Raw Amount: ${rawAmount}`);

				// Parse amount using our logic
				const amountInfo = this.parseAmount(rawAmount);
				console.log(`   Parsed Amount: ${amountInfo.parsed}`);
				console.log(`   BigInt Value: ${amountInfo.bigInt.toString()}`);
				if (amountInfo.error) {
					console.log(`   Parse Error: ${amountInfo.error}`);
				}

				// Show normalized addresses
				const normalizedFrom = this.normalizeAddress(fromAddress);
				const normalizedTo = this.normalizeAddress(toAddress);
				console.log(`   Normalized From: ${normalizedFrom}`);
				console.log(`   Normalized To: ${normalizedTo}`);
			} else {
				console.log(`   ❌ Invalid event data structure: ${JSON.stringify(event.data)}`);
			}
		});

		return transferEvents;
	}

	/**
	 * Simulate our blockchain scanner logic
	 */
	simulateScannerLogic(events, targetAddress) {
		console.log(`\n🧪 Simulating blockchain scanner logic for address: ${targetAddress}`);

		if (!targetAddress) {
			console.log('❌ No target address provided for simulation');
			return;
		}

		const normalizedTargetAddress = this.normalizeAddress(targetAddress);
		console.log(`   Normalized target address: ${normalizedTargetAddress}`);

		// Filter events involving the target address (simulating our scanner logic)
		const relevantEvents = events.filter((event) => {
			if (event.data && event.data.length >= 3) {
				const from = event.data[0];
				const to = event.data[1];

				const normalizedFrom = this.normalizeAddress(from);
				const normalizedTo = this.normalizeAddress(to);

				const matches =
					normalizedFrom === normalizedTargetAddress || normalizedTo === normalizedTargetAddress;

				if (matches) {
					console.log(`   ✅ Event matches target address: ${event.transaction_hash}`);
				}

				return matches;
			}
			return false;
		});

		console.log(`\n📊 Scanner Results:`);
		console.log(`   Total events found: ${events.length}`);
		console.log(`   Events matching target address: ${relevantEvents.length}`);

		if (relevantEvents.length > 0) {
			console.log(`\n   Matching events:`);
			relevantEvents.forEach((event, index) => {
				const from = event.data[0];
				const to = event.data[1];
				const amount = event.data[2];
				const normalizedFrom = this.normalizeAddress(from);
				const normalizedTo = this.normalizeAddress(to);

				console.log(`   ${index + 1}. TX: ${event.transaction_hash}`);
				console.log(`      From: ${from} (${normalizedFrom})`);
				console.log(`      To: ${to} (${normalizedTo})`);
				console.log(`      Amount: ${amount}`);

				// Determine transaction type
				const isReceipt = normalizedTo === normalizedTargetAddress;
				const isSpent = normalizedFrom === normalizedTargetAddress;
				console.log(`      Type: ${isReceipt ? 'RECEIPT' : isSpent ? 'SPENT' : 'UNKNOWN'}`);
			});
		} else {
			console.log(`   ❌ No events match the target address`);
		}
	}

	/**
	 * Main debugging function
	 */
	async debugTransaction(txHash, targetAddress = null) {
		console.log('🚀 Transaction Debug Script');
		console.log('='.repeat(50));

		// Fetch transaction details
		const tx = await this.fetchTransaction(txHash);
		if (!tx) return;

		// Fetch transaction receipt
		const receipt = await this.fetchTransactionReceipt(txHash);
		if (!receipt) return;

		// If we have a block number, fetch events for that block
		if (tx.block_number) {
			const events = await this.fetchEventsForBlock(tx.block_number);

			// Analyze Transfer events
			const transferEvents = this.analyzeTransferEvents(events, txHash);

			// Simulate our scanner logic
			if (targetAddress) {
				this.simulateScannerLogic(transferEvents, targetAddress);
			}

			// Show what would be stored in our database
			if (transferEvents.length > 0) {
				console.log(`\n💾 Database Storage Simulation:`);
				transferEvents.forEach((event, index) => {
					if (event.data && event.data.length >= 3) {
						const amountInfo = this.parseAmount(event.data[2]);
						console.log(
							`   Event ${index + 1}: Amount "${amountInfo.parsed}" -> Stored as "${amountInfo.parsed}"`
						);
					}
				});
			}
		} else {
			console.log('\n❌ Transaction is pending (no block number)');
		}

		console.log('\n✨ Debug analysis complete');
	}
}

// Main execution
async function main() {
	const txHash = process.argv[2] || DEFAULT_TX_HASH;
	const targetAddress = process.argv[3] || null;

	const txDebugger = new TransactionDebugger();

	try {
		await txDebugger.debugTransaction(txHash, targetAddress);
	} catch (error) {
		console.error('❌ Script execution failed:', error);
		process.exit(1);
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { TransactionDebugger };
