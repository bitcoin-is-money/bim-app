#!/usr/bin/env node

/**
 * Simple Transaction Debug Script
 *
 * Focuses on the specific transaction and address without complex joins
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, desc } from 'drizzle-orm';
import postgres from 'postgres';
import { pgTable, uuid, text, bigint, boolean, timestamp } from 'drizzle-orm/pg-core';

// Configuration
const DATABASE_URL =
	'postgresql://postgres:jPruJpRAypdhGZjooqitqLwvHBHYZmuc@shortline.proxy.rlwy.net:51926/railway';

// Target transaction and address
const TARGET_TX_HASH = '0x54d7409bf1be2cecb36b7f96b6ff29881b75ea45747a508f5970ada8fe68653';
const TARGET_ADDRESS = '0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';

// Database schema definitions (simplified)
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
 * Convert hex amount to decimal for display
 */
function parseAmount(hexAmount) {
	try {
		const cleanHex = hexAmount.startsWith('0x') ? hexAmount : `0x${hexAmount}`;
		return BigInt(cleanHex).toString();
	} catch (error) {
		return 'Parse Error';
	}
}

async function debugSimpleTransaction() {
	console.log('🔍 Simple Transaction Debug');
	console.log('='.repeat(40));
	console.log(`TX: ${TARGET_TX_HASH}`);
	console.log(`Address: ${TARGET_ADDRESS}`);

	const client = postgres(DATABASE_URL);
	const db = drizzle(client);

	try {
		// Step 1: Find the address record
		console.log('\n📋 Step 1: Address lookup...');

		const addressRecord = await db
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.starknetAddress, TARGET_ADDRESS))
			.limit(1);

		if (addressRecord.length === 0) {
			console.log('   ❌ Address not registered');
			return;
		}

		const address = addressRecord[0];
		console.log('   ✅ Address found');
		console.log(`      ID: ${address.id}`);
		console.log(`      User ID: ${address.userId}`);
		console.log(`      Active: ${address.isActive}`);
		console.log(`      Last Scanned: ${address.lastScannedBlock}`);

		// Step 2: Look for the specific transaction
		console.log('\n📊 Step 2: Transaction lookup...');

		const transactions = await db
			.select()
			.from(userTransactions)
			.where(eq(userTransactions.transactionHash, TARGET_TX_HASH));

		console.log(`   Found ${transactions.length} matching transactions`);

		if (transactions.length === 0) {
			console.log('   ❌ Transaction not in database');
		} else {
			transactions.forEach((tx, index) => {
				console.log(`\n   Transaction ${index + 1}:`);
				console.log(`      Hash: ${tx.transactionHash}`);
				console.log(`      Type: ${tx.transactionType}`);
				console.log(`      Amount: ${tx.amount} (${parseAmount(tx.amount)} decimal)`);
				console.log(`      Token: ${tx.tokenAddress}`);
				console.log(`      From: ${tx.fromAddress}`);
				console.log(`      To: ${tx.toAddress}`);
				console.log(`      Block: ${tx.blockNumber}`);
				console.log(`      User Address ID: ${tx.userAddressId}`);
				console.log(`      Timestamp: ${tx.timestamp}`);
				console.log(`      Processed: ${tx.processedAt}`);
			});
		}

		// Step 3: Look for transactions for this address
		console.log('\n📋 Step 3: All transactions for this address...');

		const allTransactions = await db
			.select()
			.from(userTransactions)
			.where(eq(userTransactions.userAddressId, address.id))
			.orderBy(desc(userTransactions.timestamp))
			.limit(20);

		console.log(`   Found ${allTransactions.length} total transactions for address`);

		allTransactions.forEach((tx, index) => {
			const isTarget = tx.transactionHash === TARGET_TX_HASH;
			const marker = isTarget ? '🎯' : '  ';

			console.log(`${marker} ${index + 1}. ${tx.transactionHash.slice(0, 20)}...`);
			console.log(`      ${tx.transactionType} | ${tx.amount} | Block: ${tx.blockNumber}`);
			console.log(`      ${tx.timestamp}`);

			if (isTarget) {
				console.log(`      👆 This is our target transaction!`);
			}
		});

		// Step 4: Check if transaction exists but for different address ID
		console.log('\n🔍 Step 4: Check if transaction exists for different address...');

		const allMatchingTx = await db
			.select({
				tx: userTransactions,
				address: userAddresses
			})
			.from(userTransactions)
			.leftJoin(userAddresses, eq(userTransactions.userAddressId, userAddresses.id))
			.where(eq(userTransactions.transactionHash, TARGET_TX_HASH));

		if (allMatchingTx.length > 0) {
			allMatchingTx.forEach((result, index) => {
				console.log(`\n   Match ${index + 1}:`);
				console.log(`      Transaction belongs to address: ${result.address?.starknetAddress}`);
				console.log(`      Our target address: ${TARGET_ADDRESS}`);
				console.log(
					`      Match: ${result.address?.starknetAddress?.toLowerCase() === TARGET_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO'}`
				);

				if (result.address?.starknetAddress?.toLowerCase() !== TARGET_ADDRESS.toLowerCase()) {
					console.log(`      ⚠️  Transaction is associated with different address!`);
					console.log(`      This could explain why it's not showing in transaction history.`);
				}
			});
		}
	} catch (error) {
		console.error('❌ Error:', error.message);
	} finally {
		await client.end();
	}

	console.log('\n✨ Simple debug complete');
}

// Run the debug function
debugSimpleTransaction().catch(console.error);
