#!/usr/bin/env node

/**
 * Database Amount Debug Script
 *
 * This script connects directly to the database to check what amounts
 * are stored for the problematic address and analyze the data flow issue.
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { userAddresses, userTransactions } from '../src/lib/db/schema.js';
import { eq, sql } from 'drizzle-orm';

// Load environment variables
config();

// Database configuration
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	console.error('❌ DATABASE_URL not found in environment variables');
	process.exit(1);
}

// The problematic address from your logs
const PROBLEM_ADDRESS = '0x0507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6';

async function debugDatabaseAmounts() {
	console.log('🔍 Debugging Database Amounts');
	console.log('='.repeat(50));
	console.log(`Problem Address: ${PROBLEM_ADDRESS}`);

	const sql_client = postgres(connectionString);
	const db = drizzle(sql_client);

	try {
		// 1. Check if address exists in user_addresses
		console.log('\n📋 Step 1: Checking if address exists in database...');
		const addresses = await db
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.starknetAddress, PROBLEM_ADDRESS));

		if (addresses.length === 0) {
			console.log('❌ Address not found in user_addresses table');
			console.log('   This means the address is not registered for any user');
			console.log(
				'   The blockchain scanner would not store transactions for unregistered addresses'
			);
			process.exit(1);
		}

		console.log(`✅ Address found in database:`);
		console.log(`   ID: ${addresses[0].id}`);
		console.log(`   User ID: ${addresses[0].userId}`);
		console.log(`   Address Type: ${addresses[0].addressType}`);
		console.log(`   Is Active: ${addresses[0].isActive}`);
		console.log(`   Last Scanned Block: ${addresses[0].lastScannedBlock}`);

		// 2. Check transactions for this address
		console.log('\n📋 Step 2: Checking transactions for this address...');
		const transactions = await db
			.select()
			.from(userTransactions)
			.where(eq(userTransactions.userAddressId, addresses[0].id));

		console.log(`Found ${transactions.length} transactions in database`);

		if (transactions.length === 0) {
			console.log('❌ No transactions found in database for this address');
			console.log('   This means either:');
			console.log('   1. The blockchain scanner has not processed transactions yet');
			console.log('   2. The transactions were not properly stored');
			console.log('   3. The scanner filtered out these transactions');
		} else {
			console.log('\n📊 Step 3: Analyzing stored transaction amounts...');

			transactions.forEach((tx, index) => {
				console.log(`\nTransaction ${index + 1}:`);
				console.log(`   Hash: ${tx.transactionHash}`);
				console.log(`   Block: ${tx.blockNumber}`);
				console.log(`   Type: ${tx.transactionType}`);
				console.log(`   Amount (raw): "${tx.amount}"`);
				console.log(`   From: ${tx.fromAddress}`);
				console.log(`   To: ${tx.toAddress}`);
				console.log(`   Token: ${tx.tokenAddress}`);
				console.log(`   Timestamp: ${tx.timestamp}`);

				// Analyze the amount format
				console.log(`\n   Amount Analysis:`);
				console.log(`     - Type: ${typeof tx.amount}`);
				console.log(`     - Length: ${tx.amount ? tx.amount.length : 'null'}`);
				console.log(`     - Is hex: ${tx.amount && tx.amount.startsWith('0x') ? 'YES' : 'NO'}`);

				if (tx.amount) {
					try {
						// Try parseFloat (what the UI currently does)
						const parseFloatResult = parseFloat(tx.amount);
						console.log(`     - parseFloat() result: ${parseFloatResult}`);
						console.log(
							`     - parseFloat() is zero: ${parseFloatResult === 0 ? 'YES - THIS IS THE PROBLEM!' : 'NO'}`
						);

						// Try proper hex parsing
						if (tx.amount.startsWith('0x') || /^[0-9a-fA-F]+$/.test(tx.amount)) {
							const hexAmount = tx.amount.startsWith('0x') ? tx.amount : `0x${tx.amount}`;
							const bigIntAmount = BigInt(hexAmount);
							console.log(`     - BigInt(hex) result: ${bigIntAmount.toString()}`);
							console.log(`     - BigInt(hex) is zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
						}
					} catch (error) {
						console.log(`     - Parse error: ${error.message}`);
					}
				}
			});

			// 4. Simulate what the UI transaction service does
			console.log('\n🚨 Step 4: Simulating UI Transaction Service Conversion...');

			transactions.forEach((tx, index) => {
				console.log(`\nTransaction ${index + 1} UI Processing:`);

				// This is what user-transaction.service.ts line 143 does
				const amount = parseFloat(tx.amount);
				const isCredit = tx.transactionType === 'receipt';
				const adjustedAmount = isCredit ? Math.abs(amount) : -Math.abs(amount);

				console.log(`   Raw amount from DB: "${tx.amount}"`);
				console.log(`   parseFloat() result: ${amount}`);
				console.log(`   Transaction type: ${tx.transactionType}`);
				console.log(`   Is credit: ${isCredit}`);
				console.log(`   Final adjusted amount: ${adjustedAmount}`);
				console.log(
					`   🚨 PROBLEM: ${adjustedAmount === 0 ? 'Amount becomes 0 in UI!' : 'Amount preserved correctly'}`
				);
			});
		}

		// 5. Check recent scanning activity
		console.log('\n📋 Step 5: Checking recent scanning activity...');
		const recentTransactions = await db
			.select({
				count: sql < number > `count(*)`.as('count'),
				latest: sql < string > `max(processed_at)`.as('latest')
			})
			.from(userTransactions)
			.where(eq(userTransactions.userAddressId, addresses[0].id));

		if (recentTransactions[0]) {
			console.log(`   Total transactions processed: ${recentTransactions[0].count}`);
			console.log(`   Latest processing time: ${recentTransactions[0].latest}`);
		}

		// 6. Recommendations
		console.log('\n🔧 Step 6: Recommendations...');

		if (transactions.length === 0) {
			console.log('\n   🚨 NO TRANSACTIONS IN DATABASE');
			console.log('   Root cause: Blockchain scanner is not storing transactions');
			console.log('   Solutions:');
			console.log('   1. Check if blockchain scanner is running');
			console.log('   2. Check scanner logs for errors');
			console.log('   3. Manually trigger a scan');
			console.log('   4. Check if address is properly normalized');
		} else {
			const hasHexAmounts = transactions.some(
				(tx) => tx.amount && (tx.amount.startsWith('0x') || /^[0-9a-fA-F]+$/.test(tx.amount))
			);

			if (hasHexAmounts) {
				console.log('\n   🚨 HEX AMOUNT PARSING ISSUE DETECTED');
				console.log('   Root cause: UI uses parseFloat() on hex strings, resulting in 0');
				console.log('   Solution: Fix user-transaction.service.ts line 143 to handle hex amounts');
				console.log('   Recommended fix:');
				console.log('   ```typescript');
				console.log('   // Replace this:');
				console.log('   const amount = parseFloat(dbTransaction.amount);');
				console.log('   ```');
				console.log('   // With this:');
				console.log('   const amount = parseAmount(dbTransaction.amount);');
				console.log('   ```');
				console.log('   function parseAmount(amountStr: string): number {');
				console.log('     if (!amountStr) return 0;');
				console.log('     try {');
				console.log('       if (amountStr.startsWith("0x") || /^[0-9a-fA-F]+$/.test(amountStr)) {');
				console.log(
					'         const hexAmount = amountStr.startsWith("0x") ? amountStr : `0x${amountStr}`;'
				);
				console.log('         return Number(BigInt(hexAmount));');
				console.log('       }');
				console.log('       return parseFloat(amountStr);');
				console.log('     } catch {');
				console.log('       return 0;');
				console.log('     }');
				console.log('   }');
				console.log('   ```');
			} else {
				console.log('\n   🤔 AMOUNTS APPEAR TO BE IN DECIMAL FORMAT');
				console.log('   Need to investigate why amounts are still showing as 0 in UI');
				console.log('   Possible causes:');
				console.log('   1. Amount conversion logic elsewhere');
				console.log('   2. Database query issues');
				console.log('   3. UI display logic problems');
			}
		}
	} catch (error) {
		console.error('❌ Database error:', error);
		console.error('Stack:', error.stack);
	} finally {
		await sql_client.end();
	}

	console.log('\n✨ Database amount debugging complete');
}

// Run the debug function
debugDatabaseAmounts().catch(console.error);
