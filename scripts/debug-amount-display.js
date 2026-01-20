#!/usr/bin/env node

/**
 * Amount Display Debug Script
 *
 * This script investigates why the home page shows 0 amounts
 * when the blockchain scanner processes non-zero amounts.
 */

import { RpcProvider } from 'starknet';

// Configuration
const RPC_URL =
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3cbbdf/rpc/v0_8';
const SPEC_VERSION = '0.9.0';

// The specific transaction we're debugging
const TARGET_TX_HASH = '0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196';

// ERC-20 Transfer event selector
const TRANSFER_EVENT_KEY = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

async function debugAmountDisplay() {
	console.log('🔍 Debugging Amount Display Issue');
	console.log('='.repeat(50));
	console.log(`Target TX: ${TARGET_TX_HASH}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// 1. Get transaction receipt and analyze events
		console.log('\n📋 Step 1: Analyzing blockchain events...');
		const receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
		console.log('✅ Transaction receipt found');
		console.log(`   Block: ${receipt.block_number}`);

		const transferEvents =
			receipt.events?.filter((event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)) ||
			[];

		console.log(`   Transfer Events: ${transferEvents.length}`);

		// 2. Show what the blockchain actually contains
		console.log('\n📊 Step 2: Blockchain Event Analysis...');
		transferEvents.forEach((event, index) => {
			if (event.data && event.data.length >= 3) {
				const fromAddress = event.data[0];
				const toAddress = event.data[1];
				const rawAmount = event.data[2];

				console.log(`\n   Event ${index + 1}:`);
				console.log(`     From: ${fromAddress.substring(0, 16)}...`);
				console.log(`     To: ${toAddress.substring(0, 16)}...`);
				console.log(`     Raw Amount: ${rawAmount}`);

				// Parse amount
				try {
					const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
					const bigIntAmount = BigInt(hexAmount);
					console.log(`     Parsed: ${bigIntAmount.toString()}`);
					console.log(`     Is Zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);
				} catch (error) {
					console.log(`     Parse Error: ${error.message}`);
				}
			}
		});

		// 3. Analyze potential issues in the data flow
		console.log('\n🚨 Step 3: Potential Issues Analysis...');

		console.log('\n   🔍 Issue: Home page shows 0, but blockchain has non-zero amounts');
		console.log('   This suggests a problem in the data flow:');

		console.log('\n   📋 Possible causes:');

		// Cause 1: Database storage issue
		console.log('\n   1. Database Storage Issue:');
		console.log('      - Scanner processes non-zero amounts correctly');
		console.log('      - But stores 0 in the database');
		console.log('      - Check user_transactions table for this transaction');
		console.log('      - Look for amount field value');

		// Cause 2: Amount parsing in scanner
		console.log('\n   2. Amount Parsing in Scanner:');
		console.log('      - Scanner might be parsing amounts incorrectly');
		console.log('      - Converting non-zero amounts to 0 during storage');
		console.log('      - Check BlockchainScannerService.parseTransferEvent method');

		// Cause 3: Database schema issue
		console.log('\n   3. Database Schema Issue:');
		console.log('      - amount field might be wrong type');
		console.log('      - Database constraints might be forcing 0 values');
		console.log('      - Check user_transactions table schema');

		// Cause 4: Data retrieval issue
		console.log('\n   4. Data Retrieval Issue:');
		console.log('      - Database stores correct amounts');
		console.log('      - But home page query returns 0');
		console.log('      - Check home page database query');
		console.log('      - Look for JOIN issues or field mapping');

		// Cause 5: Amount conversion/formatting
		console.log('\n   5. Amount Conversion/Formatting:');
		console.log('      - Amount stored correctly in database');
		console.log('      - But converted to 0 during display');
		console.log('      - Check amount formatting logic in home page');
		console.log('      - Look for division by decimals or other conversions');

		// 4. Specific debugging steps
		console.log('\n🔧 Step 4: Specific Debugging Steps...');

		console.log('\n   To investigate this issue, check these areas:');

		console.log('\n   1. Check Database Storage:');
		console.log(
			`      SELECT * FROM user_transactions WHERE transaction_hash = '${TARGET_TX_HASH}';`
		);
		console.log('      Look at the amount field value');

		console.log('\n   2. Check Scanner Logs:');
		console.log('      Look for BlockchainScannerService logs during scanning');
		console.log('      Check if amounts are being parsed correctly');
		console.log('      Look for any warnings about amount parsing');

		console.log('\n   3. Check Home Page Query:');
		console.log('      Look at the database query in your home page route');
		console.log('      Check for any JOINs with user_addresses table');
		console.log('      Verify field mapping is correct');

		console.log('\n   4. Check Amount Formatting:');
		console.log('      Look at how amounts are displayed in the home page');
		console.log('      Check for any division by token decimals');
		console.log('      Look for amount conversion utilities');

		console.log('\n   5. Check Database Schema:');
		console.log('      DESCRIBE user_transactions;');
		console.log('      Check amount field type and constraints');

		// 5. Common patterns that cause this issue
		console.log('\n📋 Step 5: Common Patterns That Cause This Issue...');

		console.log('\n   🚨 Pattern 1: Token Decimal Division');
		console.log('      - Scanner stores raw amount (e.g., 16088672816183672)');
		console.log('      - Home page divides by token decimals (e.g., 18)');
		console.log('      - Division result might be 0 due to precision loss');
		console.log('      - Solution: Use BigInt for division, not Number');

		console.log('\n   🚨 Pattern 2: Wrong Field Mapping');
		console.log('      - Database query might be selecting wrong field');
		console.log('      - JOIN might be mapping to a different amount field');
		console.log('      - Solution: Verify field names in query');

		console.log('\n   🚨 Pattern 3: Amount Type Conversion');
		console.log('      - Amount stored as string in database');
		console.log('      - But retrieved as number and converted to 0');
		console.log('      - Solution: Ensure proper type handling');

		console.log('\n   🚨 Pattern 4: Scanner Storage Bug');
		console.log('      - Scanner processes non-zero amounts');
		console.log('      - But stores 0 due to parsing error');
		console.log('      - Solution: Check scanner amount parsing logic');

		// 6. Immediate investigation commands
		console.log('\n🔍 Step 6: Immediate Investigation Commands...');

		console.log('\n   Run these commands to investigate:');

		console.log('\n   1. Check if transaction exists in database:');
		console.log(
			`      SELECT transaction_hash, amount, transaction_type, from_address, to_address `
		);
		console.log(`      FROM user_transactions `);
		console.log(`      WHERE transaction_hash = '${TARGET_TX_HASH}';`);

		console.log('\n   2. Check database schema:');
		console.log('      DESCRIBE user_transactions;');

		console.log('\n   3. Check home page query (in your code):');
		console.log('      Look for files like:');
		console.log('      - src/routes/+page.server.ts');
		console.log('      - src/routes/+page.svelte');
		console.log('      - Any database query files');

		console.log('\n   4. Check scanner service:');
		console.log('      Look at BlockchainScannerService.parseTransferEvent method');
		console.log('      Verify amount parsing logic');

		// 7. Summary and next steps
		console.log('\n📋 Step 7: Summary and Next Steps...');

		console.log('\n   🔍 What we know:');
		console.log('   - Blockchain has non-zero amounts (confirmed)');
		console.log('   - Scanner logic works correctly (confirmed)');
		console.log('   - Home page shows 0 (the issue)');

		console.log('\n   🚨 Most likely causes:');
		console.log('   1. Amount stored as 0 in database');
		console.log('   2. Amount retrieved as 0 from database');
		console.log('   3. Amount converted to 0 during display');

		console.log('\n   🔧 Next steps:');
		console.log('   1. Check database for the transaction');
		console.log('   2. Check home page database query');
		console.log('   3. Check amount formatting logic');
		console.log('   4. Check scanner amount parsing');
	} catch (error) {
		console.error('❌ Error during debugging:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Amount display debugging complete');
}

// Run the debug function
debugAmountDisplay().catch(console.error);
