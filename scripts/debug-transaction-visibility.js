#!/usr/bin/env node

/**
 * Debug Transaction Visibility Script
 *
 * Since the transaction exists in the database but may not appear in the UI,
 * this script investigates potential filtering or display issues.
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

// Database schema definitions
const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false)
});

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

/**
 * Get token symbol from address (simplified mapping)
 */
function getTokenSymbol(tokenAddress) {
	const tokens = {
		'0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac': 'WBTC',
		'0x3fe2b97c1fd336e750087d68b9b867997fd64a584fc15e8a92329a794ce8e88c': 'WBTC (old)',
		'0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d': 'STRK',
		'0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7': 'ETH'
	};

	const normalized = tokenAddress.toLowerCase();
	return tokens[normalized] || `${tokenAddress.slice(0, 10)}...`;
}

async function debugTransactionVisibility() {
	console.log('👀 Debug Transaction Visibility');
	console.log('='.repeat(50));
	console.log(`Target TX: ${TARGET_TX_HASH}`);
	console.log(`Target Address: ${TARGET_ADDRESS}`);

	const client = postgres(DATABASE_URL);
	const db = drizzle(client);

	try {
		// Step 1: Get detailed transaction information
		console.log('\n📋 Step 1: Detailed transaction information...');

		const transactionResults = await db
			.select({
				txId: userTransactions.id,
				txHash: userTransactions.transactionHash,
				txType: userTransactions.transactionType,
				amount: userTransactions.amount,
				tokenAddress: userTransactions.tokenAddress,
				fromAddress: userTransactions.fromAddress,
				toAddress: userTransactions.toAddress,
				blockNumber: userTransactions.blockNumber,
				timestamp: userTransactions.timestamp,
				processedAt: userTransactions.processedAt,
				addressId: userAddresses.id,
				userAddress: userAddresses.starknetAddress,
				userId: userAddresses.userId,
				isActive: userAddresses.isActive,
				userEmail: users.email
			})
			.from(userTransactions)
			.leftJoin(userAddresses, eq(userTransactions.userAddressId, userAddresses.id))
			.leftJoin(users, eq(userAddresses.userId, users.id))
			.where(eq(userTransactions.transactionHash, TARGET_TX_HASH));

		if (transactionResults.length === 0) {
			console.log('   ❌ Transaction not found in database');
			return;
		}

		console.log(`   ✅ Found ${transactionResults.length} transaction record(s)`);

		transactionResults.forEach((tx, index) => {
			console.log(`\n   Transaction ${index + 1}:`);
			console.log(`      ID: ${tx.txId}`);
			console.log(`      Hash: ${tx.txHash}`);
			console.log(`      Type: ${tx.txType}`);
			console.log(`      Amount: ${tx.amount} (${parseAmount(tx.amount)} decimal)`);
			console.log(`      Token: ${getTokenSymbol(tx.tokenAddress)}`);
			console.log(`      Token Address: ${tx.tokenAddress}`);
			console.log(`      From: ${tx.fromAddress}`);
			console.log(`      To: ${tx.toAddress}`);
			console.log(`      Block: ${tx.blockNumber}`);
			console.log(`      Timestamp: ${tx.timestamp}`);
			console.log(`      Processed: ${tx.processedAt}`);
			console.log(`      Address ID: ${tx.addressId}`);
			console.log(`      User Address: ${tx.userAddress}`);
			console.log(`      User ID: ${tx.userId}`);
			console.log(`      User Email: ${tx.userEmail || 'N/A'}`);
			console.log(`      Address Active: ${tx.isActive}`);
		});

		// Step 2: Check for any potential filtering issues
		console.log('\n🔍 Step 2: Checking for filtering issues...');

		const targetTx = transactionResults[0];

		// Check amount
		const amountDecimal = parseAmount(targetTx.amount);
		console.log(`   Amount Check: ${targetTx.amount} -> ${amountDecimal}`);
		if (amountDecimal === '0') {
			console.log('   ⚠️  Zero amount transaction - might be filtered in UI');
		} else if (amountDecimal === 'Parse Error') {
			console.log('   ❌ Amount parsing error - would cause display issues');
		} else {
			console.log('   ✅ Amount looks valid');
		}

		// Check token
		const tokenSymbol = getTokenSymbol(targetTx.tokenAddress);
		console.log(`   Token Check: ${tokenSymbol}`);

		// Check addresses
		console.log(`   Address Match Check:`);
		if (targetTx.userAddress?.toLowerCase() === TARGET_ADDRESS.toLowerCase()) {
			console.log('   ✅ Address matches exactly');
		} else {
			console.log(
				`   ⚠️  Address mismatch: DB has ${targetTx.userAddress}, looking for ${TARGET_ADDRESS}`
			);
		}

		// Check if address is active
		if (targetTx.isActive) {
			console.log('   ✅ Address is active for monitoring');
		} else {
			console.log('   ❌ Address is inactive - transactions might not display');
		}

		// Step 3: Get recent transactions for comparison
		console.log('\n📊 Step 3: Recent transactions for this address...');

		const addressRecord = await db
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.starknetAddress, TARGET_ADDRESS))
			.limit(1);

		if (addressRecord.length > 0) {
			const recentTransactions = await db
				.select({
					txHash: userTransactions.transactionHash,
					txType: userTransactions.transactionType,
					amount: userTransactions.amount,
					tokenAddress: userTransactions.tokenAddress,
					blockNumber: userTransactions.blockNumber,
					timestamp: userTransactions.timestamp,
					processedAt: userTransactions.processedAt
				})
				.from(userTransactions)
				.where(eq(userTransactions.userAddressId, addressRecord[0].id))
				.orderBy(desc(userTransactions.timestamp))
				.limit(10);

			console.log(`   Found ${recentTransactions.length} recent transactions:`);

			recentTransactions.forEach((tx, index) => {
				const isTargetTx = tx.txHash === TARGET_TX_HASH;
				const marker = isTargetTx ? '🎯' : '  ';
				console.log(`${marker} ${index + 1}. ${tx.txHash.slice(0, 16)}... (${tx.txType})`);
				console.log(`      Amount: ${tx.amount} (${parseAmount(tx.amount)})`);
				console.log(`      Token: ${getTokenSymbol(tx.tokenAddress)}`);
				console.log(`      Block: ${tx.blockNumber} | ${tx.timestamp}`);

				if (isTargetTx) {
					console.log(`      👆 This is our target transaction!`);
				}
			});
		}

		// Step 4: Check for common UI filtering conditions
		console.log('\n🖥️  Step 4: Common UI filtering conditions...');

		console.log('   Checking potential UI filters:');

		// Zero amount filter
		if (parseAmount(targetTx.amount) === '0') {
			console.log('   ❌ Zero amount - some UIs filter out zero-value transactions');
		} else {
			console.log('   ✅ Non-zero amount');
		}

		// Recent time filter (last 30 days)
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		if (targetTx.timestamp < thirtyDaysAgo) {
			console.log(`   ⚠️  Transaction is older than 30 days - some UIs have time limits`);
			console.log(`      TX time: ${targetTx.timestamp}`);
			console.log(`      30 days ago: ${thirtyDaysAgo}`);
		} else {
			console.log('   ✅ Transaction is recent (within 30 days)');
		}

		// Token type filter
		if (getTokenSymbol(targetTx.tokenAddress).includes('STRK')) {
			console.log('   ⚠️  STRK token - some UIs filter out gas fee transactions');
		} else {
			console.log('   ✅ Non-STRK token');
		}

		// Step 5: API endpoint simulation
		console.log('\n🔌 Step 5: Simulating API endpoint...');

		// This simulates what the /api/user/transactions endpoint would return
		const apiSimulationQuery = db
			.select({
				id: userTransactions.id,
				transactionHash: userTransactions.transactionHash,
				transactionType: userTransactions.transactionType,
				amount: userTransactions.amount,
				tokenAddress: userTransactions.tokenAddress,
				fromAddress: userTransactions.fromAddress,
				toAddress: userTransactions.toAddress,
				blockNumber: userTransactions.blockNumber,
				timestamp: userTransactions.timestamp
			})
			.from(userTransactions)
			.leftJoin(userAddresses, eq(userTransactions.userAddressId, userAddresses.id))
			.where(
				and(eq(userAddresses.starknetAddress, TARGET_ADDRESS), eq(userAddresses.isActive, true))
			)
			.orderBy(desc(userTransactions.timestamp))
			.limit(50);

		const apiResults = await apiSimulationQuery;

		const targetTxInApi = apiResults.find((tx) => tx.transactionHash === TARGET_TX_HASH);

		if (targetTxInApi) {
			console.log('   ✅ Transaction would appear in API results');
			console.log(
				`      Position in results: ${apiResults.findIndex((tx) => tx.transactionHash === TARGET_TX_HASH) + 1} of ${apiResults.length}`
			);
		} else {
			console.log('   ❌ Transaction would NOT appear in API results');
			console.log('   This suggests an issue with the query conditions or data');
		}
	} catch (error) {
		console.error('❌ Error during debugging:', error);
		console.error('Stack:', error.stack);
	} finally {
		await client.end();
	}

	console.log('\n✨ Transaction visibility analysis complete');
}

// Run the debug function
debugTransactionVisibility().catch(console.error);
