#!/usr/bin/env node

/**
 * STRK Transaction Cleanup Script
 *
 * This script removes existing STRK token transactions from the database
 * since they should not be displayed in the user dashboard (gas fees).
 *
 * @author bim
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, bigint, boolean } from 'drizzle-orm/pg-core';

// Database configuration
const DATABASE_URL =
	'postgresql://postgres:jPruJpRAypdhGZjooqitqLwvHBHYZmuc@shortline.proxy.rlwy.net:51926/railway';

// STRK token contract address
const STRK_CONTRACT_ADDRESS = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

// Define the schema inline
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
 * Normalize address for comparison
 */
function normalizeAddress(address) {
	const clean = address.startsWith('0x') ? address.slice(2) : address;
	return clean.replace(/^0+/, '').toLowerCase() || '0';
}

async function cleanupStrkTransactions() {
	console.log('🧹 STRK Transaction Cleanup');
	console.log('='.repeat(50));
	console.log(`STRK Contract: ${STRK_CONTRACT_ADDRESS}`);

	const sql_client = postgres(DATABASE_URL, {
		ssl: 'prefer'
	});
	const db = drizzle(sql_client);

	try {
		// 1. Find all STRK transactions
		console.log('\n📋 Step 1: Finding STRK transactions...');

		const normalizedStrkAddress = normalizeAddress(STRK_CONTRACT_ADDRESS);
		console.log(`Normalized STRK address: ${normalizedStrkAddress}`);

		const strkTransactions = await db
			.select()
			.from(userTransactions)
			.where(eq(userTransactions.tokenAddress, STRK_CONTRACT_ADDRESS));

		console.log(`Found ${strkTransactions.length} STRK transactions in database`);

		if (strkTransactions.length === 0) {
			console.log('✅ No STRK transactions found - database is clean!');
			return;
		}

		// 2. Show details of STRK transactions to be deleted
		console.log('\n📊 Step 2: STRK transactions to be removed...');

		strkTransactions.forEach((tx, index) => {
			console.log(`\nSTRK Transaction ${index + 1}:`);
			console.log(`  Hash: ${tx.transactionHash}`);
			console.log(`  Block: ${tx.blockNumber}`);
			console.log(`  Type: ${tx.transactionType}`);
			console.log(`  Amount: ${tx.amount}`);
			console.log(`  Time: ${tx.timestamp.toISOString()}`);
		});

		// 3. Ask for confirmation (in a real scenario, you might want a --confirm flag)
		console.log('\n⚠️  Step 3: Confirmation...');
		console.log(`About to DELETE ${strkTransactions.length} STRK transactions.`);
		console.log('These are gas fee transactions that should not appear in the user dashboard.');
		console.log('\nProceeding with deletion...');

		// 4. Delete STRK transactions
		console.log('\n🗑️  Step 4: Deleting STRK transactions...');

		const deleteResult = await db
			.delete(userTransactions)
			.where(eq(userTransactions.tokenAddress, STRK_CONTRACT_ADDRESS));

		console.log(`✅ Successfully deleted STRK transactions`);

		// 5. Verify cleanup
		console.log('\n📋 Step 5: Verifying cleanup...');

		const remainingStrkTransactions = await db
			.select()
			.from(userTransactions)
			.where(eq(userTransactions.tokenAddress, STRK_CONTRACT_ADDRESS));

		if (remainingStrkTransactions.length === 0) {
			console.log('✅ Cleanup verified - no STRK transactions remain');
		} else {
			console.log(
				`❌ Cleanup incomplete - ${remainingStrkTransactions.length} STRK transactions still exist`
			);
		}

		// 6. Summary
		console.log('\n📊 Step 6: Summary...');
		console.log(`\nCleanup Results:`);
		console.log(`  STRK transactions deleted: ${strkTransactions.length}`);
		console.log(
			`  Database now clean of STRK transactions: ${remainingStrkTransactions.length === 0 ? 'YES' : 'NO'}`
		);

		console.log(`\n🎯 Impact:`);
		console.log(`  - Users will no longer see gas fee transactions in their dashboard`);
		console.log(`  - Only relevant token transfers (WBTC, ETH, etc.) will be displayed`);
		console.log(`  - Future STRK transactions will be filtered out by the updated scanner`);

		console.log(`\n📋 Next Steps:`);
		console.log(`  1. Run the diagnostic script again to verify the account shows clean data`);
		console.log(`  2. Deploy the updated blockchain scanner with STRK filtering`);
		console.log(`  3. Monitor logs to ensure STRK transactions are being filtered out`);
	} catch (error) {
		console.error('❌ Cleanup error:', error);
		console.error('Stack:', error.stack);
	} finally {
		await sql_client.end();
	}

	console.log('\n✨ STRK transaction cleanup complete');
}

// Run the cleanup
cleanupStrkTransactions().catch(console.error);
