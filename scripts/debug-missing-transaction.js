#!/usr/bin/env node

/**
 * Debug Missing Transaction Script
 *
 * Investigates why transaction 0x54d7409bf1be2cecb36b7f96b6ff29881b75ea45747a508f5970ada8fe68653
 * doesn't appear in the transaction history for address 0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda
 */

import { RpcProvider } from 'starknet';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import { pgTable, uuid, text, bigint, boolean, timestamp } from 'drizzle-orm/pg-core';

// Configuration
const RPC_URL =
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3cbbdf/rpc/v0_8';
const SPEC_VERSION = '0.9.0';
const DATABASE_URL =
	'postgresql://postgres:jPruJpRAypdhGZjooqitqLwvHBHYZmuc@shortline.proxy.rlwy.net:51926/railway';

// Target transaction and address
const TARGET_TX_HASH = '0x54d7409bf1be2cecb36b7f96b6ff29881b75ea45747a508f5970ada8fe68653';
const TARGET_ADDRESS = '0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';

// Blockchain constants
const TRANSFER_EVENT_KEY = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';
const WBTC_CONTRACT_ADDRESS = '0x3fe2b97c1fd336e750087d68b9b867997fd64a584fc15e8a92329a794ce8e88c';
const STRK_CONTRACT_ADDRESS = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

// Database schema definitions
const userAddresses = pgTable('user_addresses', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull(),
	starknetAddress: text('starknet_address').notNull(),
	addressType: text('address_type').notNull().default('main'),
	isActive: boolean('is_active').notNull().default(true),
	registeredAt: timestamp('registered_at').defaultNow().notNull(),
	lastScannedBlock: bigint('last_scanned_block', { mode: 'number' }).notNull().default(0)
});

const userTransactions = pgTable('user_transactions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userAddressId: uuid('user_address_id').notNull(),
	transactionHash: text('transaction_hash').notNull(),
	blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
	transactionType: text('transaction_type').notNull(),
	amount: text('amount').notNull(),
	tokenAddress: text('token_address').notNull(),
	fromAddress: text('from_address').notNull(),
	toAddress: text('to_address').notNull(),
	timestamp: timestamp('timestamp').notNull(),
	processedAt: timestamp('processed_at').defaultNow().notNull()
});

/**
 * Normalize address for comparison (same logic as blockchain scanner)
 */
function normalizeAddress(address) {
	if (!address) return '';
	const clean = address.startsWith('0x') ? address.slice(2) : address;
	return clean.replace(/^0+/, '').toLowerCase() || '0';
}

/**
 * Parse transfer event (same logic as blockchain scanner)
 */
function parseTransferEvent(event) {
	const fromAddress = event.data[0] ?? '';
	const toAddress = event.data[1] ?? '';
	const rawAmount = event.data[2] ?? '0x0';
	const tokenAddress = event.from_address;

	// Parse and validate amount
	let amount = '0';
	if (rawAmount) {
		try {
			const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
			const bigIntAmount = BigInt(hexAmount);
			amount = rawAmount; // Store original format
		} catch (error) {
			console.log(`   ⚠️  Failed to parse amount "${rawAmount}": ${error.message}`);
			amount = '0';
		}
	}

	return {
		transactionHash: event.transaction_hash,
		blockNumber: event.block_number,
		tokenAddress: tokenAddress || '',
		fromAddress: fromAddress || '',
		toAddress: toAddress || '',
		amount,
		timestamp: event.block_timestamp ? new Date(event.block_timestamp * 1000) : new Date()
	};
}

/**
 * Simulate blockchain scanner filtering logic
 */
function simulateScannerLogic(parsedEvents, targetAddress) {
	console.log('\n🧪 Simulating Blockchain Scanner Logic...');

	const normalizedTargetAddress = normalizeAddress(targetAddress);
	console.log(`   Target address (normalized): ${normalizedTargetAddress}`);

	// Filter events to only include those involving our address
	const addressEvents = parsedEvents.filter((event) => {
		const normalizedFrom = normalizeAddress(event.fromAddress);
		const normalizedTo = normalizeAddress(event.toAddress);

		const matches =
			normalizedFrom === normalizedTargetAddress || normalizedTo === normalizedTargetAddress;

		if (matches) {
			console.log(`   ✅ Address match found: ${event.fromAddress} -> ${event.toAddress}`);
		}

		return matches;
	});

	console.log(`   Found ${addressEvents.length} events involving target address`);

	if (addressEvents.length === 0) {
		console.log('   ❌ No events found involving target address');
		return null;
	}

	// Group by transaction hash
	const transactionGroups = new Map();
	for (const event of addressEvents) {
		const txHash = event.transactionHash;
		if (!transactionGroups.has(txHash)) {
			transactionGroups.set(txHash, []);
		}
		transactionGroups.get(txHash).push(event);
	}

	console.log(`   Found ${transactionGroups.size} transaction(s) with events`);

	// Process each transaction group (simulate what scanner does)
	for (const [txHash, txEvents] of transactionGroups) {
		console.log(`\n   📦 Processing transaction: ${txHash}`);
		console.log(`      Events in transaction: ${txEvents.length}`);

		// Filter out STRK token events
		const filteredEvents = txEvents.filter((event) => {
			const normalizedEventToken = normalizeAddress(event.tokenAddress);
			const normalizedStrkToken = normalizeAddress(STRK_CONTRACT_ADDRESS);
			const isStrkToken = normalizedEventToken === normalizedStrkToken;

			if (isStrkToken) {
				console.log(`      🚫 Filtering out STRK token event: Amount ${event.amount}`);
			}

			return !isStrkToken;
		});

		console.log(`      After STRK filtering: ${filteredEvents.length} events`);

		if (filteredEvents.length === 0) {
			console.log(`      ❌ Transaction only contains STRK events, would be skipped entirely`);
			continue;
		}

		// Simulate event selection logic
		let selectedEvent = filteredEvents[0]; // Default to first

		if (filteredEvents.length > 1) {
			console.log(`      🔍 Multiple events found, applying selection logic...`);

			// Look for WBTC events first
			const wbtcEvents = filteredEvents.filter((event) => {
				const normalizedEventToken = normalizeAddress(event.tokenAddress);
				const normalizedWbtcToken = normalizeAddress(WBTC_CONTRACT_ADDRESS);
				return normalizedEventToken === normalizedWbtcToken;
			});

			console.log(`      WBTC events found: ${wbtcEvents.length}`);

			if (wbtcEvents.length > 0) {
				// Select WBTC event with highest non-zero amount
				const nonZeroWbtcEvents = wbtcEvents.filter((event) => {
					try {
						const hexAmount = event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`;
						return BigInt(hexAmount) > 0n;
					} catch {
						return false;
					}
				});

				if (nonZeroWbtcEvents.length > 0) {
					selectedEvent = nonZeroWbtcEvents.reduce((max, current) => {
						try {
							const maxAmount = BigInt(
								max.amount.startsWith('0x') ? max.amount : `0x${max.amount}`
							);
							const currentAmount = BigInt(
								current.amount.startsWith('0x') ? current.amount : `0x${current.amount}`
							);
							return currentAmount > maxAmount ? current : max;
						} catch {
							return max;
						}
					});
					console.log(`      ✅ Selected WBTC event with amount: ${selectedEvent.amount}`);
				} else {
					selectedEvent = wbtcEvents[0];
					console.log(`      ✅ Selected WBTC event (zero amount): ${selectedEvent.amount}`);
				}
			} else {
				// No WBTC events, select highest non-zero amount
				const nonZeroEvents = filteredEvents.filter((event) => {
					try {
						const hexAmount = event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`;
						return BigInt(hexAmount) > 0n;
					} catch {
						return false;
					}
				});

				if (nonZeroEvents.length > 0) {
					selectedEvent = nonZeroEvents.reduce((max, current) => {
						try {
							const maxAmount = BigInt(
								max.amount.startsWith('0x') ? max.amount : `0x${max.amount}`
							);
							const currentAmount = BigInt(
								current.amount.startsWith('0x') ? current.amount : `0x${current.amount}`
							);
							return currentAmount > maxAmount ? current : max;
						} catch {
							return max;
						}
					});
					console.log(`      ✅ Selected highest amount event: ${selectedEvent.amount}`);
				} else {
					console.log(`      ⚠️  All events have zero amounts, using first event`);
				}
			}
		}

		// Determine transaction type
		const normalizedTo = normalizeAddress(selectedEvent.toAddress);
		const transactionType = normalizedTo === normalizedTargetAddress ? 'receipt' : 'spent';

		console.log(`      📊 Final selection:`);
		console.log(`         Token: ${selectedEvent.tokenAddress}`);
		console.log(`         From: ${selectedEvent.fromAddress}`);
		console.log(`         To: ${selectedEvent.toAddress}`);
		console.log(`         Amount: ${selectedEvent.amount}`);
		console.log(`         Type: ${transactionType}`);

		return {
			selectedEvent,
			transactionType,
			wouldBeStored: true
		};
	}

	return null;
}

async function debugMissingTransaction() {
	console.log('🔍 Debug Missing Transaction');
	console.log('='.repeat(60));
	console.log(`Target TX: ${TARGET_TX_HASH}`);
	console.log(`Target Address: ${TARGET_ADDRESS}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	const client = postgres(DATABASE_URL);
	const db = drizzle(client);

	try {
		// Step 1: Check if address is registered in database
		console.log('\n📋 Step 1: Checking address registration...');
		try {
			const addressRecords = await db
				.select()
				.from(userAddresses)
				.where(eq(userAddresses.starknetAddress, TARGET_ADDRESS));

			if (addressRecords.length === 0) {
				console.log('   ❌ TARGET ADDRESS NOT REGISTERED');
				console.log('   This is likely the main reason the transaction is missing!');
				console.log('   The blockchain scanner only monitors registered addresses.');
			} else {
				const addressRecord = addressRecords[0];
				console.log('   ✅ Address is registered');
				console.log(`      User ID: ${addressRecord.userId}`);
				console.log(`      Address Type: ${addressRecord.addressType}`);
				console.log(`      Is Active: ${addressRecord.isActive}`);
				console.log(`      Last Scanned Block: ${addressRecord.lastScannedBlock}`);
			}
		} catch (error) {
			console.log(`   ❌ Database error: ${error.message}`);
		}

		// Step 2: Check if transaction already exists in database
		console.log('\n📊 Step 2: Checking if transaction exists in database...');
		try {
			const existingTx = await db
				.select()
				.from(userTransactions)
				.where(eq(userTransactions.transactionHash, TARGET_TX_HASH));

			if (existingTx.length === 0) {
				console.log('   ❌ Transaction not found in database');
			} else {
				console.log('   ✅ Transaction found in database');
				existingTx.forEach((tx, index) => {
					console.log(`      Record ${index + 1}:`);
					console.log(`         Type: ${tx.transactionType}`);
					console.log(`         Amount: ${tx.amount}`);
					console.log(`         Token: ${tx.tokenAddress}`);
					console.log(`         Processed: ${tx.processedAt}`);
				});
			}
		} catch (error) {
			console.log(`   ❌ Database error: ${error.message}`);
		}

		// Step 3: Get transaction details from blockchain
		console.log('\n🌐 Step 3: Fetching transaction from blockchain...');
		let tx, receipt;

		try {
			tx = await provider.getTransaction(TARGET_TX_HASH);
			console.log('   ✅ Transaction found on blockchain');
			console.log(`      Block Number: ${tx.block_number || 'Pending'}`);
			console.log(`      Status: ${tx.status || 'Unknown'}`);
			console.log(`      Type: ${tx.type || 'Unknown'}`);
		} catch (error) {
			console.log(`   ❌ Failed to get transaction: ${error.message}`);
			return;
		}

		try {
			receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
			console.log('   ✅ Transaction receipt found');
			console.log(`      Events: ${receipt.events?.length || 0}`);
			console.log(`      Status: ${receipt.status || 'Unknown'}`);
			console.log(`      Block Number: ${receipt.block_number || 'N/A'}`);
		} catch (error) {
			console.log(`   ❌ Failed to get receipt: ${error.message}`);
		}

		if (!tx.block_number) {
			console.log('   ❌ Transaction is pending, cannot analyze events');
			return;
		}

		// Step 4: Analyze events in the transaction
		console.log('\n📡 Step 4: Analyzing transaction events...');

		if (!receipt || !receipt.events || receipt.events.length === 0) {
			console.log('   ❌ No events found in transaction');
			return;
		}

		console.log(`   Found ${receipt.events.length} total events`);

		// Find Transfer events
		const transferEvents = receipt.events.filter(
			(event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)
		);

		console.log(`   Found ${transferEvents.length} Transfer events`);

		if (transferEvents.length === 0) {
			console.log('   ❌ No Transfer events found - not a token transfer');
			return;
		}

		// Parse Transfer events
		const parsedEvents = transferEvents.map((event) => parseTransferEvent(event));

		console.log('\n   📊 Transfer Events Analysis:');
		parsedEvents.forEach((event, index) => {
			console.log(`\n   Event ${index + 1}:`);
			console.log(`      Token Contract: ${event.tokenAddress}`);
			console.log(`      From: ${event.fromAddress}`);
			console.log(`      To: ${event.toAddress}`);
			console.log(`      Amount: ${event.amount}`);

			// Check if amount is zero
			try {
				const hexAmount = event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`;
				const bigIntAmount = BigInt(hexAmount);
				console.log(`      Is Zero Amount: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
				if (bigIntAmount > 0n) {
					console.log(`      Decimal Amount: ${bigIntAmount.toString()}`);
				}
			} catch (error) {
				console.log(`      Parse Error: ${error.message}`);
			}

			// Check address involvement
			const normalizedFrom = normalizeAddress(event.fromAddress);
			const normalizedTo = normalizeAddress(event.toAddress);
			const normalizedTarget = normalizeAddress(TARGET_ADDRESS);

			const fromMatch = normalizedFrom === normalizedTarget;
			const toMatch = normalizedTo === normalizedTarget;

			console.log(`      Involves Target Address: ${fromMatch || toMatch ? 'YES' : 'NO'}`);
			if (fromMatch) console.log(`        -> Target is sender`);
			if (toMatch) console.log(`        -> Target is receiver`);
		});

		// Step 5: Simulate blockchain scanner logic
		const scannerResult = simulateScannerLogic(parsedEvents, TARGET_ADDRESS);

		// Step 6: Final diagnosis
		console.log('\n🔬 Step 5: Final Diagnosis...');

		if (!scannerResult) {
			console.log('   ❌ Scanner simulation shows transaction would NOT be processed');
			console.log('   Possible reasons:');
			console.log('      - Target address not involved in any Transfer events');
			console.log('      - All Transfer events are STRK token (filtered out)');
			console.log('      - No valid Transfer events found');
		} else {
			console.log('   ✅ Scanner simulation shows transaction WOULD be processed');
			console.log('   This suggests the issue is operational, not technical:');
			console.log('      - Address might not be registered for monitoring');
			console.log('      - Scanner service might not be running');
			console.log('      - Block might not have been scanned yet');
			console.log('      - Database connectivity issues');
		}

		// Step 7: Recommendations
		console.log('\n💡 Recommendations:');

		// Check address registration first
		const addressRecords = await db
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.starknetAddress, TARGET_ADDRESS));

		if (addressRecords.length === 0) {
			console.log('   🎯 PRIMARY ISSUE: Address not registered for monitoring');
			console.log('   SOLUTION: Register the address in user_addresses table:');
			console.log('   ```sql');
			console.log(
				`   INSERT INTO user_addresses (user_id, starknet_address, address_type, is_active)`
			);
			console.log(`   VALUES ('[USER_UUID]', '${TARGET_ADDRESS}', 'main', true);`);
			console.log('   ```');
		} else {
			const addressRecord = addressRecords[0];
			if (!addressRecord.isActive) {
				console.log('   🎯 ISSUE: Address is registered but inactive');
				console.log('   SOLUTION: Activate the address monitoring');
			} else if (addressRecord.lastScannedBlock < tx.block_number) {
				console.log(`   🎯 ISSUE: Scanner hasn't reached transaction block yet`);
				console.log(
					`   Last scanned: ${addressRecord.lastScannedBlock}, TX block: ${tx.block_number}`
				);
				console.log('   SOLUTION: Wait for scanner to catch up or trigger manual scan');
			} else {
				console.log('   🎯 ISSUE: Scanner should have processed this transaction');
				console.log('   SOLUTIONS:');
				console.log('      - Check scanner service logs for errors');
				console.log('      - Verify database connectivity');
				console.log('      - Trigger manual blockchain scan');
			}
		}
	} catch (error) {
		console.error('❌ Error during debugging:', error);
		console.error('Stack:', error.stack);
	} finally {
		await client.end();
	}

	console.log('\n✨ Debug analysis complete');
}

// Run the debug function
debugMissingTransaction().catch(console.error);
