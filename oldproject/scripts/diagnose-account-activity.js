#!/usr/bin/env node

/**
 * Account Activity Diagnostic Script
 *
 * This script provides a comprehensive analysis of today's activity for a specific
 * Starknet account, explaining why amounts might appear as "absurd" or "0" in the UI.
 *
 * It connects directly to the database, analyzes stored transactions, and shows
 * how different parsing methods affect the displayed amounts.
 *
 * @author bim
 */

import { desc, eq } from 'drizzle-orm';
import { bigint, boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Define the schema inline to avoid import issues
const userAddresses = pgTable('user_addresses', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull(),
	starknetAddress: text('starknet_address').notNull(),
	addressType: text('address_type').notNull().default('main'),
	isActive: boolean('is_active').notNull().default(true),
	registeredAt: timestamp('registered_at').defaultNow().notNull(),
	lastScannedBlock: bigint('last_scanned_block', { mode: 'number' }).default(0)
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

// Database configuration
const DATABASE_URL =
	'postgresql://postgres:jPruJpRAypdhGZjooqitqLwvHBHYZmuc@shortline.proxy.rlwy.net:51926/railway';

// Target account from your report
const TARGET_ACCOUNT = '0x0507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6';

// Known token addresses and their decimals
const TOKEN_INFO = {
	'0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac': {
		symbol: 'WBTC',
		decimals: 8,
		name: 'Wrapped Bitcoin',
		shouldDisplay: true
	},
	'0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7': {
		symbol: 'ETH',
		decimals: 18,
		name: 'Ethereum',
		shouldDisplay: true
	},
	'0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8': {
		symbol: 'USDT',
		decimals: 6,
		name: 'Tether USD',
		shouldDisplay: true
	},
	'0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8': {
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		shouldDisplay: true
	},
	'0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d': {
		symbol: 'STRK',
		decimals: 18,
		name: 'Starknet Token',
		shouldDisplay: false // STRK should be filtered out!
	}
};

/**
 * Parse amount string that could be in hex or decimal format (old buggy method)
 */
function parseAmountOldWay(amountStr) {
	return parseFloat(amountStr);
}

/**
 * Parse amount string that could be in hex or decimal format (new fixed method)
 */
function parseAmountNewWay(amountStr) {
	if (!amountStr) {
		return 0;
	}

	try {
		// Check if it's a hex string (starts with 0x or is all hex digits)
		if (amountStr.startsWith('0x') || /^[0-9a-fA-F]+$/.test(amountStr)) {
			const hexAmount = amountStr.startsWith('0x') ? amountStr : `0x${amountStr}`;
			const bigIntValue = BigInt(hexAmount);
			const numberValue = Number(bigIntValue);
			return numberValue;
		}

		// Otherwise treat as decimal string
		const decimalValue = parseFloat(amountStr);
		return decimalValue;
	} catch (error) {
		console.warn(`Failed to parse amount "${amountStr}":`, error);
		return 0;
	}
}

/**
 * Convert raw token amount to human-readable format
 */
function formatTokenAmount(rawAmount, tokenAddress) {
	const tokenInfo = TOKEN_INFO[tokenAddress];
	if (!tokenInfo) {
		return {
			formatted: rawAmount.toString(),
			symbol: 'Unknown',
			decimals: 0
		};
	}

	const divisor = Math.pow(10, tokenInfo.decimals);
	const humanAmount = rawAmount / divisor;

	return {
		formatted: humanAmount.toFixed(tokenInfo.decimals),
		symbol: tokenInfo.symbol,
		decimals: tokenInfo.decimals,
		name: tokenInfo.name
	};
}

/**
 * Get today's date range for filtering
 */
function getTodayDateRange() {
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const endOfToday = new Date(startOfToday);
	endOfToday.setDate(endOfToday.getDate() + 1);

	return { startOfToday, endOfToday };
}

/**
 * Normalize address for comparison
 */
function normalizeAddress(address) {
	const clean = address.startsWith('0x') ? address.slice(2) : address;
	return clean.replace(/^0+/, '').toLowerCase() || '0';
}

async function diagnoseAccountActivity() {
	console.log('🔍 Diagnosing Account Activity');
	console.log('='.repeat(60));
	console.log(`Target Account: ${TARGET_ACCOUNT}`);
	console.log(`Database: Connected to Railway PostgreSQL`);

	const { startOfToday, endOfToday } = getTodayDateRange();
	console.log(`Date Range: ${startOfToday.toISOString().split('T')[0]} (today)`);

	const sql_client = postgres(DATABASE_URL, {
		ssl: 'prefer'
	});
	const db = drizzle(sql_client);

	try {
		// 1. Check if address exists in user_addresses
		console.log('\n📋 Step 1: Checking if address is registered...');

		const addresses = await db
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.starknetAddress, TARGET_ACCOUNT));

		if (addresses.length === 0) {
			console.log('❌ Address not found in user_addresses table');
			console.log('   This means:');
			console.log('   - The address is not registered to any user');
			console.log('   - No transactions would be tracked or displayed');
			console.log('   - This explains why you might not see expected activity');

			console.log('\n🔧 Solution:');
			console.log('   1. Register the address through /api/user/addresses/register');
			console.log('   2. Trigger a blockchain scan to backfill transactions');
			return;
		}

		const addressRecord = addresses[0];
		console.log(`✅ Address found:`);
		console.log(`   User ID: ${addressRecord.userId}`);
		console.log(`   Address Type: ${addressRecord.addressType}`);
		console.log(`   Is Active: ${addressRecord.isActive}`);
		console.log(`   Last Scanned Block: ${addressRecord.lastScannedBlock}`);

		// 2. Get all transactions for this address
		console.log('\n📋 Step 2: Fetching all transactions...');

		const allTransactions = await db
			.select()
			.from(userTransactions)
			.where(eq(userTransactions.userAddressId, addressRecord.id))
			.orderBy(desc(userTransactions.timestamp));

		console.log(`Found ${allTransactions.length} total transactions in database`);

		// 3. Filter for today's transactions
		console.log("\n📋 Step 3: Filtering today's transactions...");

		const todayTransactions = allTransactions.filter((tx) => {
			const txDate = new Date(tx.timestamp);
			return txDate >= startOfToday && txDate < endOfToday;
		});

		console.log(`Found ${todayTransactions.length} transactions for today`);

		if (todayTransactions.length === 0) {
			console.log('\n🤔 No transactions found for today');
			console.log('   This could mean:');
			console.log('   1. No actual transactions occurred today');
			console.log("   2. Blockchain scanner hasn't processed today's blocks yet");
			console.log('   3. Transactions exist but were filtered out');

			// Show recent transactions for context
			const recentTransactions = allTransactions.slice(0, 5);
			if (recentTransactions.length > 0) {
				console.log('\n📊 Most Recent Transactions (for context):');
				recentTransactions.forEach((tx, index) => {
					console.log(
						`   ${index + 1}. ${tx.transactionHash.substring(0, 16)}... - ${new Date(tx.timestamp).toLocaleDateString()}`
					);
				});
			}
			return;
		}

		// 4. Analyze each transaction in detail
		console.log("\n📊 Step 4: Analyzing Today's Transactions...");
		console.log('='.repeat(50));

		let totalOldWayDisplay = 0;
		let totalNewWayDisplay = 0;
		let suspiciousTransactions = [];

		todayTransactions.forEach((tx, index) => {
			console.log(`\nTransaction ${index + 1}:`);
			console.log(`  Hash: ${tx.transactionHash}`);
			console.log(`  Block: ${tx.blockNumber}`);
			console.log(
				`  Type: ${tx.transactionType} (${tx.transactionType === 'receipt' ? 'incoming' : 'outgoing'})`
			);
			console.log(`  Time: ${new Date(tx.timestamp).toLocaleString()}`);
			console.log(`  Raw Amount: "${tx.amount}"`);
			console.log(`  Token: ${tx.tokenAddress}`);
			console.log(`  From: ${tx.fromAddress}`);
			console.log(`  To: ${tx.toAddress}`);

			// Analyze the amount parsing
			console.log(`\n  Amount Analysis:`);
			console.log(`    Raw string: "${tx.amount}"`);
			console.log(`    String type: ${typeof tx.amount}`);
			console.log(`    String length: ${tx.amount ? tx.amount.length : 0}`);
			console.log(
				`    Is hex format: ${tx.amount && (tx.amount.startsWith('0x') || /^[0-9a-fA-F]+$/.test(tx.amount))}`
			);

			// Test old way (parseFloat - the bug)
			const oldWayAmount = parseAmountOldWay(tx.amount);
			console.log(`    Old way (parseFloat): ${oldWayAmount}`);

			// Test new way (proper hex parsing)
			const newWayAmount = parseAmountNewWay(tx.amount);
			console.log(`    New way (parseAmount): ${newWayAmount}`);

			// Check if this transaction shows the "absurd amount" issue
			const isAbsurdAmount = newWayAmount > 1000000000000; // Arbitrarily large threshold
			const wasZeroBefore = oldWayAmount === 0;

			if (isAbsurdAmount && wasZeroBefore) {
				suspiciousTransactions.push({
					transaction: tx,
					oldAmount: oldWayAmount,
					newAmount: newWayAmount,
					reason: 'Large hex value appears absurd when parsed'
				});
			}

			// Format with token info
			const tokenInfo = formatTokenAmount(newWayAmount, tx.tokenAddress);
			console.log(`    Human readable: ${tokenInfo.formatted} ${tokenInfo.symbol}`);
			if (tokenInfo.name !== 'Unknown') {
				console.log(`    Token info: ${tokenInfo.name} (${tokenInfo.decimals} decimals)`);
			}

			// Transaction type adjustment (+ for receipts, - for spends)
			const isCredit = tx.transactionType === 'receipt';
			const adjustedOldWay = isCredit ? Math.abs(oldWayAmount) : -Math.abs(oldWayAmount);
			const adjustedNewWay = isCredit ? Math.abs(newWayAmount) : -Math.abs(newWayAmount);

			console.log(`    UI Display (old way): ${adjustedOldWay >= 0 ? '+' : ''}${adjustedOldWay}`);
			console.log(`    UI Display (new way): ${adjustedNewWay >= 0 ? '+' : ''}${adjustedNewWay}`);

			// Identify the issue
			if (wasZeroBefore && newWayAmount > 0) {
				console.log(`    🚨 ISSUE: This transaction showed as 0 before the fix!`);
			}
			if (isAbsurdAmount) {
				console.log(`    🚨 ISSUE: This transaction shows an absurdly large amount!`);
				console.log(`    💡 LIKELY CAUSE: Raw token amount needs decimal adjustment`);
			}

			totalOldWayDisplay += adjustedOldWay;
			totalNewWayDisplay += adjustedNewWay;
		});

		// 5. Summary and explanation
		console.log('\n📊 Step 5: Summary and Explanation...');
		console.log('='.repeat(40));

		console.log(`\nTransactions Summary:`);
		console.log(`  Total transactions today: ${todayTransactions.length}`);
		console.log(`  Suspicious transactions: ${suspiciousTransactions.length}`);

		console.log(`\nUI Display Totals:`);
		console.log(`  Old way (buggy parseFloat): ${totalOldWayDisplay}`);
		console.log(`  New way (fixed parseAmount): ${totalNewWayDisplay}`);

		// 6. Explain the "absurd amount" issue
		if (suspiciousTransactions.length > 0) {
			console.log(`\n🚨 Step 6: Explaining "Absurd Amounts"...`);
			console.log('='.repeat(40));

			suspiciousTransactions.forEach((suspicious, index) => {
				const tx = suspicious.transaction;
				const tokenInfo = formatTokenAmount(suspicious.newAmount, tx.tokenAddress);

				console.log(`\nSuspicious Transaction ${index + 1}:`);
				console.log(`  Hash: ${tx.transactionHash}`);
				console.log(`  Raw amount: "${tx.amount}"`);
				console.log(`  Parsed as number: ${suspicious.newAmount}`);
				console.log(`  With decimals: ${tokenInfo.formatted} ${tokenInfo.symbol}`);
				console.log(`  Issue: ${suspicious.reason}`);

				// Explain why it looks absurd
				if (tokenInfo.decimals > 0) {
					console.log(`\n  💡 Explanation:`);
					console.log(`    - Raw blockchain amount: ${suspicious.newAmount}`);
					console.log(`    - Token decimals: ${tokenInfo.decimals}`);
					console.log(
						`    - Actual amount: ${suspicious.newAmount} ÷ 10^${tokenInfo.decimals} = ${tokenInfo.formatted} ${tokenInfo.symbol}`
					);
					console.log(
						`    - UI currently shows: ${suspicious.newAmount} (without decimal adjustment)`
					);
					console.log(`    - This appears "absurd" because decimals aren't applied in the UI`);
				}
			});

			console.log(`\n🔧 Step 7: Root Cause and Solution...`);
			console.log('='.repeat(40));
			console.log(`\n🚨 ROOT CAUSE IDENTIFIED:`);
			console.log(`  The UI correctly parses hex amounts but doesn't adjust for token decimals.`);
			console.log(`  For example: 100000000 WBTC base units = 1.0 WBTC (8 decimals)`);
			console.log(`  But the UI shows 100000000 instead of 1.0`);

			console.log(`\n🔧 SOLUTION:`);
			console.log(`  Update the transaction display logic to:`);
			console.log(`  1. Parse hex amounts correctly ✅ (already fixed)`);
			console.log(`  2. Apply token decimal conversion ❌ (still needed)`);
			console.log(`  3. Display human-readable amounts`);

			console.log(`\n📋 Implementation Steps:`);
			console.log(`  1. Update user-transaction.service.ts transformTransaction method`);
			console.log(`  2. Add token decimal lookup (from TOKEN_INFO or API)`);
			console.log(`  3. Divide raw amounts by 10^decimals before display`);
			console.log(`  4. Test with the problematic account`);
		} else {
			console.log(`\n✅ No suspicious transactions found`);
			console.log(`   All amounts appear to be reasonable for display`);
		}

		// 7. Actionable recommendations
		console.log(`\n🎯 Step 8: Actionable Recommendations...`);
		console.log('='.repeat(40));

		console.log(`\nImmediate Actions:`);
		console.log(`  1. Check if ${TARGET_ACCOUNT} is your account`);
		console.log(`  2. Look at today's displayed amounts in the UI`);
		console.log(`  3. Compare with the analysis above`);

		if (suspiciousTransactions.length > 0) {
			console.log(`\nTo Fix "Absurd Amounts":`);
			console.log(`  1. Modify src/lib/services/client/user-transaction.service.ts`);
			console.log(`  2. Update the parseAmount method to handle token decimals`);
			console.log(`  3. Add token metadata lookup (address → decimals mapping)`);
			console.log(`  4. Test with this account's transactions`);
		}

		console.log(`\nTo Verify the Fix:`);
		console.log(`  1. Run this script again after deploying changes`);
		console.log(`  2. Check browser console for parseAmount debug logs`);
		console.log(`  3. Verify amounts look reasonable in the UI`);
	} catch (error) {
		console.error('❌ Database error:', error);
		console.error('Stack:', error.stack);

		// Provide helpful error context
		if (error.message.includes('connection')) {
			console.log('\n💡 Connection Help:');
			console.log('   - Check if the database URL is correct');
			console.log('   - Verify Railway database is running');
			console.log('   - Check if SSL settings are needed');
		}
	} finally {
		await sql_client.end();
	}

	console.log('\n✨ Account activity diagnosis complete');
	console.log('\nNext steps:');
	console.log('1. Review the analysis above');
	console.log('2. Check your UI for the transactions mentioned');
	console.log('3. Implement token decimal handling if needed');
	console.log('4. Re-run this script to verify fixes');
}

// Run the diagnosis
diagnoseAccountActivity().catch(console.error);
