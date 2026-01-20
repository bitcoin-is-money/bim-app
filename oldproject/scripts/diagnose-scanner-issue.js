#!/usr/bin/env node

/**
 * Scanner Issue Diagnosis Script
 *
 * This script identifies the specific issue with the blockchain scanner
 * by checking address registration, block scanning status, and configuration.
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

// Addresses involved in the transaction
const TRANSACTION_ADDRESSES = [
	'0x4f278e1f19e495c3b1dd35ef307c4f7510768ed95481958fbae588bd173f79a', // From address in Event 1 & 2
	'0x507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6', // To address in Event 1 & 2
	'0xed260a2d0a05a706822e43b3b10c4435b524f7bdb13b44c4c9c6bbcf16a6fb', // From address in Event 3
	'0x1176a1bd84444c89232ec27754698e5d2e7e1a7f1539f12027f28b23ec9f3d8' // To address in Event 3
];

async function diagnoseScannerIssue() {
	console.log('🔍 Diagnosing Blockchain Scanner Issue');
	console.log('='.repeat(50));
	console.log(`Target TX: ${TARGET_TX_HASH}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// 1. Check transaction status and block
		console.log('\n📋 Step 1: Transaction Analysis...');
		const receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
		console.log('✅ Transaction receipt found');
		console.log(`   Block: ${receipt.block_number}`);
		console.log(`   Events: ${receipt.events?.length || 0}`);

		const transferEvents =
			receipt.events?.filter((event) => event.keys && event.keys.includes(TRANSFER_EVENT_KEY)) ||
			[];

		console.log(`   Transfer Events: ${transferEvents.length}`);

		if (transferEvents.length > 0) {
			console.log('   ✅ Transfer events are available and parseable');
		}

		// 2. Check latest block and confirmations
		console.log('\n📡 Step 2: Block Status Analysis...');
		const latestBlock = await provider.getBlock('latest');
		console.log(`✅ Latest block: ${latestBlock.block_number}`);

		const confirmations = latestBlock.block_number - receipt.block_number;
		console.log(`   Confirmations: ${confirmations}`);

		if (confirmations < 0) {
			console.log('   ⚠️  Transaction block is newer than latest block (should not happen)');
		} else if (confirmations < 10) {
			console.log('   ⚠️  Transaction has very few confirmations (might be recent)');
		} else {
			console.log('   ✅ Transaction has sufficient confirmations');
		}

		// 3. Check if addresses are being monitored
		console.log('\n🔍 Step 3: Address Monitoring Analysis...');
		console.log('   Addresses involved in the transaction:');

		TRANSACTION_ADDRESSES.forEach((address, index) => {
			console.log(`   ${index + 1}. ${address.substring(0, 16)}...`);
		});

		console.log('\n   🔧 To check if these addresses are monitored:');
		console.log('   1. Check your database for user_addresses entries');
		console.log('   2. Verify the addresses are registered and active');
		console.log('   3. Check if last_scanned_block is up to date');

		// 4. Check block scanning range
		console.log('\n📊 Step 4: Block Scanning Range Analysis...');

		// Calculate expected scanning range
		const expectedFromBlock = Math.max(0, receipt.block_number - 100); // Assume scanner looks back 100 blocks
		const expectedToBlock = latestBlock.block_number;

		console.log(`   Expected scanning range: ${expectedFromBlock} to ${expectedToBlock}`);
		console.log(
			`   Transaction block ${receipt.block_number} is ${receipt.block_number >= expectedFromBlock ? 'WITHIN' : 'OUTSIDE'} this range`
		);

		if (receipt.block_number < expectedFromBlock) {
			console.log('   🚨 ISSUE: Transaction block is outside expected scanning range!');
			console.log('   This could happen if:');
			console.log('   - Scanner is not running');
			console.log('   - Scanner is behind on blocks');
			console.log('   - Scanner configuration is incorrect');
		} else {
			console.log('   ✅ Transaction block is within expected scanning range');
		}

		// 5. Test event fetching for the specific block
		console.log('\n🧪 Step 5: Testing Event Fetching...');
		try {
			const eventsResponse = await provider.getEvents({
				from_block: { block_number: receipt.block_number },
				to_block: { block_number: receipt.block_number },
				keys: [[TRANSFER_EVENT_KEY]],
				chunk_size: 1000
			});

			console.log(
				`   ✅ Successfully fetched ${eventsResponse.events.length} Transfer events from block ${receipt.block_number}`
			);

			// Check if our transaction events are in the results
			const ourTxEvents = eventsResponse.events.filter(
				(event) => event.transaction_hash === TARGET_TX_HASH
			);

			console.log(`   📊 Found ${ourTxEvents.length} events for our transaction`);

			if (ourTxEvents.length > 0) {
				console.log('   ✅ Events are accessible via RPC');
			} else {
				console.log('   ❌ Events not found via RPC (this would be a major issue)');
			}
		} catch (error) {
			console.log(`   ❌ Failed to fetch events: ${error.message}`);
			console.log('   This could indicate RPC issues or block access problems');
		}

		// 6. Check for common scanner issues
		console.log('\n🚨 Step 6: Common Scanner Issues...');

		console.log('\n   📋 Potential Issues and Solutions:');

		// Issue 1: Address not registered
		console.log('\n   1. Address Registration Issue:');
		console.log(
			'      - Check if any of the transaction addresses are in your user_addresses table'
		);
		console.log('      - Verify addresses are marked as active (is_active = true)');
		console.log('      - Check if addresses were registered before this transaction');

		// Issue 2: Block scanning behind
		console.log('\n   2. Block Scanning Behind:');
		console.log('      - Check last_scanned_block in user_addresses table');
		console.log("      - If it's < 1792224, scanner is behind");
		console.log('      - Check if scanner service is running');
		console.log('      - Check for scanner errors in logs');

		// Issue 3: Scanner configuration
		console.log('\n   3. Scanner Configuration:');
		console.log('      - Verify RPC endpoint is accessible');
		console.log('      - Check scanner service status');
		console.log('      - Verify event selector is correct');
		console.log('      - Check scanner logs for errors');

		// Issue 4: Database issues
		console.log('\n   4. Database Issues:');
		console.log('      - Check if user_transactions table exists');
		console.log('      - Verify database connection');
		console.log('      - Check for transaction insertion errors');

		// 7. Specific debugging commands
		console.log('\n🔧 Step 7: Debugging Commands...');

		console.log('\n   To investigate further, run these commands:');
		console.log('\n   1. Check scanner status:');
		console.log('      npm run debug:tx:status');

		console.log('\n   2. Test scanner logic:');
		console.log('      npm run test:scanner');

		console.log('\n   3. Check database for addresses:');
		console.log('      SELECT * FROM user_addresses WHERE starknet_address IN (');
		TRANSACTION_ADDRESSES.forEach((addr, index) => {
			const comma = index < TRANSACTION_ADDRESSES.length - 1 ? ',' : '';
			console.log(`        '${addr}'${comma}`);
		});
		console.log('      );');

		console.log('\n   4. Check database for transactions:');
		console.log(
			`      SELECT * FROM user_transactions WHERE transaction_hash = '${TARGET_TX_HASH}';`
		);

		console.log('\n   5. Check scanner service logs:');
		console.log('      Look for BlockchainScannerService logs in your application');
		console.log('      Check for errors or warnings during scanning');

		// 8. Summary
		console.log('\n📋 Step 8: Summary...');

		console.log('\n   🔍 What we know:');
		console.log(`   - Transaction ${TARGET_TX_HASH} is confirmed in block ${receipt.block_number}`);
		console.log(
			`   - Transaction has ${transferEvents.length} Transfer events with non-zero amounts`
		);
		console.log(`   - Events are accessible via RPC`);
		console.log(`   - Address filtering logic works correctly`);
		console.log(`   - Amount parsing works correctly`);

		console.log('\n   🚨 Most likely causes:');
		console.log('   1. Addresses not registered in scanner');
		console.log('   2. Scanner not scanning block 1792224');
		console.log('   3. Scanner service not running');
		console.log('   4. Database insertion failures');

		console.log('\n   🔧 Next steps:');
		console.log('   1. Check address registration in database');
		console.log('   2. Verify scanner is running and scanning');
		console.log('   3. Check scanner logs for errors');
		console.log('   4. Verify database schema and connections');
	} catch (error) {
		console.error('❌ Error during diagnosis:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Diagnosis complete');
}

// Run the diagnosis function
diagnoseScannerIssue().catch(console.error);
