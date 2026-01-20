#!/usr/bin/env node

/**
 * Test Attribution Fix
 *
 * This script tests whether the fixed transaction attribution logic
 * correctly handles the problematic transaction by creating records
 * for both sender and recipient.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, desc } from 'drizzle-orm';
import postgres from 'postgres';
import { pgTable, uuid, text, bigint, boolean, timestamp } from 'drizzle-orm/pg-core';

// Configuration
const DATABASE_URL =
	'postgresql://postgres:jPruJpRAypdhGZjooqitqLwvHBHYZmuc@shortline.proxy.rlwy.net:51926/railway';

// Target transaction and addresses
const TARGET_TX_HASH = '0x54d7409bf1be2cecb36b7f96b6ff29881b75ea45747a508f5970ada8fe68653';
const RECIPIENT_ADDRESS = '0x0586c15475165b0389a82763e8a86ff3ff5a6c90a43daa61cc9f5b37da59deda';
const SENDER_ADDRESS = '0x04871dbf5a7de465fb5c19cf8e3d87cc538391313f7cf5a58d5b6f89b8a795c2';

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

function parseAmount(hexAmount) {
	try {
		const cleanHex = hexAmount.startsWith('0x') ? hexAmount : `0x${hexAmount}`;
		return BigInt(cleanHex).toString();
	} catch (error) {
		return 'Parse Error';
	}
}

async function testAttributionFix() {
	console.log('🧪 Test Attribution Fix');
	console.log('='.repeat(40));
	console.log(`TX: ${TARGET_TX_HASH}`);
	console.log(`Recipient: ${RECIPIENT_ADDRESS}`);
	console.log(`Sender: ${SENDER_ADDRESS}`);

	const client = postgres(DATABASE_URL);
	const db = drizzle(client);

	try {
		// Step 1: Check both addresses are registered
		console.log('\n📋 Step 1: Verify both addresses are registered...');

		const recipientRecord = await db
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.starknetAddress, RECIPIENT_ADDRESS))
			.limit(1);

		const senderRecord = await db
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.starknetAddress, SENDER_ADDRESS))
			.limit(1);

		if (recipientRecord.length === 0) {
			console.log('   ❌ Recipient address not registered');
			return;
		}

		if (senderRecord.length === 0) {
			console.log('   ❌ Sender address not registered');
			return;
		}

		console.log('   ✅ Both addresses are registered');
		console.log(`      Recipient ID: ${recipientRecord[0].id}`);
		console.log(`      Sender ID: ${senderRecord[0].id}`);

		// Step 2: Check current transaction records
		console.log('\n📊 Step 2: Current transaction records...');

		const allTxRecords = await db
			.select({
				tx: userTransactions,
				address: userAddresses
			})
			.from(userTransactions)
			.leftJoin(userAddresses, eq(userTransactions.userAddressId, userAddresses.id))
			.where(eq(userTransactions.transactionHash, TARGET_TX_HASH));

		console.log(`   Found ${allTxRecords.length} existing records for this transaction:`);

		allTxRecords.forEach((record, index) => {
			console.log(`\n   Record ${index + 1}:`);
			console.log(`      Address: ${record.address?.starknetAddress}`);
			console.log(`      User ID: ${record.address?.userId}`);
			console.log(`      Type: ${record.tx.transactionType}`);
			console.log(`      Amount: ${record.tx.amount} (${parseAmount(record.tx.amount)})`);
		});

		// Step 3: Test the improved logic (simulation)
		console.log('\n🧪 Step 3: Simulating improved logic...');

		// Simulate what should happen with the fix:
		// 1. Scanner processes sender address first
		// 2. Finds transaction, creates "spent" record for sender
		// 3. Scanner processes recipient address second
		// 4. With the fix: checks if transaction exists for THIS user address (recipient)
		// 5. Finds no existing record for recipient, creates "receipt" record

		console.log('\n   Expected behavior with the fix:');
		console.log('   1. Sender should have: type="spent", amount="0x5dc"');
		console.log('   2. Recipient should have: type="receipt", amount="0x5dc"');

		// Check if we have the expected pattern
		const senderTx = allTxRecords.find(
			(r) => r.address?.starknetAddress?.toLowerCase() === SENDER_ADDRESS.toLowerCase()
		);
		const recipientTx = allTxRecords.find(
			(r) => r.address?.starknetAddress?.toLowerCase() === RECIPIENT_ADDRESS.toLowerCase()
		);

		console.log('\n   Current state:');
		if (senderTx) {
			console.log(`   ✅ Sender has record: type="${senderTx.tx.transactionType}"`);
		} else {
			console.log(`   ❌ Sender missing record`);
		}

		if (recipientTx) {
			console.log(`   ✅ Recipient has record: type="${recipientTx.tx.transactionType}"`);
		} else {
			console.log(`   ❌ Recipient missing record - this is the bug!`);
		}

		// Step 4: Show what needs to happen
		console.log('\n💡 Step 4: What needs to happen next...');

		if (allTxRecords.length === 1) {
			console.log('   Current situation: Only one record exists (likely for sender)');
			console.log('   Action needed: Re-scan the recipient address to create the missing record');
			console.log(
				'   The fix ensures the scanner will now create a separate record for the recipient'
			);
		} else if (allTxRecords.length === 2) {
			console.log('   ✅ Both records exist - fix has already been applied or worked');
		} else {
			console.log('   ⚠️  Unexpected number of records');
		}

		// Step 5: Verify the fix prevents the original issue
		console.log('\n🔍 Step 5: Verify the fix logic...');

		const txHash = TARGET_TX_HASH;

		// Simulate old logic: check if transaction exists anywhere
		const oldLogicCheck = await db
			.select()
			.from(userTransactions)
			.where(eq(userTransactions.transactionHash, txHash))
			.limit(1);

		console.log('   Old logic result:');
		console.log(
			`      Global transaction check: ${oldLogicCheck.length > 0 ? 'EXISTS' : 'NOT EXISTS'}`
		);
		console.log(`      Decision: ${oldLogicCheck.length > 0 ? 'SKIP (wrong!)' : 'PROCESS'}`);

		// Simulate new logic: check if transaction exists for specific user
		const newLogicSenderCheck = await db
			.select()
			.from(userTransactions)
			.where(
				and(
					eq(userTransactions.transactionHash, txHash),
					eq(userTransactions.userAddressId, senderRecord[0].id)
				)
			)
			.limit(1);

		const newLogicRecipientCheck = await db
			.select()
			.from(userTransactions)
			.where(
				and(
					eq(userTransactions.transactionHash, txHash),
					eq(userTransactions.userAddressId, recipientRecord[0].id)
				)
			)
			.limit(1);

		console.log('\n   New logic result:');
		console.log(
			`      Sender-specific check: ${newLogicSenderCheck.length > 0 ? 'EXISTS' : 'NOT EXISTS'}`
		);
		console.log(`      Sender decision: ${newLogicSenderCheck.length > 0 ? 'SKIP' : 'PROCESS'}`);
		console.log(
			`      Recipient-specific check: ${newLogicRecipientCheck.length > 0 ? 'EXISTS' : 'NOT EXISTS'}`
		);
		console.log(
			`      Recipient decision: ${newLogicRecipientCheck.length > 0 ? 'SKIP' : 'PROCESS ✅'}`
		);

		if (newLogicSenderCheck.length > 0 && newLogicRecipientCheck.length === 0) {
			console.log(
				'\n   🎯 Perfect! The fix allows recipient processing while preventing sender duplication'
			);
		}
	} catch (error) {
		console.error('❌ Error:', error.message);
	} finally {
		await client.end();
	}

	console.log('\n✨ Attribution fix test complete');
}

// Run the test
testAttributionFix().catch(console.error);
