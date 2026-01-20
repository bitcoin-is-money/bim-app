#!/usr/bin/env node

/**
 * Blockchain Event Analyzer Script
 *
 * This script fetches events directly from the blockchain for the problematic
 * address and compares them with what should be stored in the database.
 */

import { config } from 'dotenv';
import { RpcProvider } from 'starknet';

// Load environment variables
config();

// Configuration
const RPC_URL =
	process.env.PUBLIC_STARKNET_RPC_URL ||
	'https://starknet-mainnet.blastapi.io/8cfd9ea7-bee5-42cc-ac4f-0e99ed3cbbdf/rpc/v0_8';
const SPEC_VERSION = process.env.PUBLIC_STARKNET_SPEC_VERSION || '0.9.0';

// The problematic address from your logs
const PROBLEM_ADDRESS = '0x0507307f39dc57b5fc310b5d1b2f83ab5ea585f9cd09821b194a9eca5801a4a6';

// From your logs: scanning blocks 1810824 to 1810843
const FROM_BLOCK = 1810824;
const TO_BLOCK = 1810843;

// ERC-20 Transfer event selector
const TRANSFER_EVENT_KEY = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

/**
 * Normalize address for comparison (remove 0x prefix and leading zeros)
 */
function normalizeAddress(address) {
	const clean = address.startsWith('0x') ? address.slice(2) : address;
	return clean.replace(/^0+/, '').toLowerCase() || '0';
}

async function analyzeBlockchainEvents() {
	console.log('🔍 Analyzing Blockchain Events vs Database Storage');
	console.log('='.repeat(60));
	console.log(`Problem Address: ${PROBLEM_ADDRESS}`);
	console.log(`Block Range: ${FROM_BLOCK} - ${TO_BLOCK}`);
	console.log(`RPC URL: ${RPC_URL}`);

	const provider = new RpcProvider({
		nodeUrl: RPC_URL,
		specVersion: SPEC_VERSION
	});

	try {
		// 1. Get all Transfer events in the block range
		console.log('\n📋 Step 1: Fetching Transfer events from blockchain...');

		const response = await provider.getEvents({
			from_block: { block_number: FROM_BLOCK },
			to_block: { block_number: TO_BLOCK },
			keys: [[TRANSFER_EVENT_KEY]],
			chunk_size: 1000
		});

		console.log(`Found ${response.events.length} total Transfer events in block range`);

		// 2. Filter events to only include those involving our problem address
		console.log('\n📋 Step 2: Filtering events for problem address...');

		const normalizedProblemAddress = normalizeAddress(PROBLEM_ADDRESS);
		console.log(`Normalized problem address: ${normalizedProblemAddress}`);

		const relevantEvents = response.events.filter((event) => {
			if (event.data && event.data.length >= 3) {
				const from = event.data[0];
				const to = event.data[1];

				const normalizedFrom = normalizeAddress(from);
				const normalizedTo = normalizeAddress(to);

				return (
					normalizedFrom === normalizedProblemAddress || normalizedTo === normalizedProblemAddress
				);
			}
			return false;
		});

		console.log(`Found ${relevantEvents.length} events involving the problem address`);

		if (relevantEvents.length === 0) {
			console.log('❌ No events found for this address in the specified block range');
			console.log('   This means either:');
			console.log('   1. The address had no transactions in this range');
			console.log('   2. The block range is incorrect');
			console.log('   3. The address normalization is not matching');
			return;
		}

		// 3. Analyze each relevant event
		console.log('\n📊 Step 3: Analyzing relevant events...');

		const analyzedEvents = [];

		relevantEvents.forEach((event, index) => {
			console.log(`\n--- Event ${index + 1} ---`);
			console.log(`Transaction Hash: ${event.transaction_hash}`);
			console.log(`Block Number: ${event.block_number}`);
			console.log(`Token Address: ${event.from_address}`);

			if (event.data && event.data.length >= 3) {
				const fromAddress = event.data[0];
				const toAddress = event.data[1];
				const rawAmount = event.data[2];

				console.log(`From: ${fromAddress}`);
				console.log(`To: ${toAddress}`);
				console.log(`Raw Amount: ${rawAmount}`);

				// Determine transaction type relative to our address
				const normalizedFrom = normalizeAddress(fromAddress);
				const normalizedTo = normalizeAddress(toAddress);
				const normalizedProblem = normalizeAddress(PROBLEM_ADDRESS);

				const transactionType = normalizedTo === normalizedProblem ? 'receipt' : 'spent';
				console.log(`Transaction Type: ${transactionType} (relative to problem address)`);

				// Parse amount in different formats
				console.log(`\nAmount Analysis:`);

				try {
					// Try hex parsing (what blockchain scanner should do)
					const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
					const bigIntAmount = BigInt(hexAmount);
					console.log(`  - BigInt(hex): ${bigIntAmount.toString()}`);
					console.log(`  - Is zero: ${bigIntAmount === 0n ? 'YES' : 'NO'}`);

					// Try parseFloat (what UI currently does - this is the problem!)
					const parseFloatResult = parseFloat(rawAmount);
					console.log(`  - parseFloat(): ${parseFloatResult}`);
					console.log(
						`  - parseFloat() is zero: ${parseFloatResult === 0 ? 'YES - THIS IS THE UI ISSUE!' : 'NO'}`
					);

					// Convert to human readable (assuming 18 decimals for most tokens)
					const humanReadable = Number(bigIntAmount) / Math.pow(10, 18);
					console.log(`  - Human readable (÷10^18): ${humanReadable}`);
				} catch (error) {
					console.log(`  - Parse error: ${error.message}`);
				}

				analyzedEvents.push({
					transactionHash: event.transaction_hash,
					blockNumber: event.block_number,
					tokenAddress: event.from_address,
					fromAddress,
					toAddress,
					rawAmount,
					transactionType,
					shouldBeStored: true
				});
			}
		});

		// 4. Summary of what should be in database
		console.log('\n📋 Step 4: What should be stored in database...');

		console.log(`\nExpected database records for address ${PROBLEM_ADDRESS}:`);
		analyzedEvents.forEach((event, index) => {
			console.log(`\nRecord ${index + 1}:`);
			console.log(`  transaction_hash: '${event.transactionHash}'`);
			console.log(`  block_number: ${event.blockNumber}`);
			console.log(`  transaction_type: '${event.transactionType}'`);
			console.log(`  amount: '${event.rawAmount}' (stored as hex string)`);
			console.log(`  token_address: '${event.tokenAddress}'`);
			console.log(`  from_address: '${event.fromAddress}'`);
			console.log(`  to_address: '${event.toAddress}'`);
		});

		// 5. Issue analysis and recommendations
		console.log('\n🚨 Step 5: Issue Analysis and Recommendations...');

		console.log('\n📊 Summary:');
		console.log(`  - Events found on blockchain: ${relevantEvents.length}`);
		console.log(`  - Events that should be stored: ${analyzedEvents.length}`);

		const nonZeroEvents = analyzedEvents.filter((event) => {
			try {
				const hexAmount = event.rawAmount.startsWith('0x')
					? event.rawAmount
					: `0x${event.rawAmount}`;
				return BigInt(hexAmount) > 0n;
			} catch {
				return false;
			}
		});

		console.log(`  - Non-zero amount events: ${nonZeroEvents.length}`);

		if (nonZeroEvents.length > 0) {
			console.log('\n🚨 ROOT CAUSE IDENTIFIED:');
			console.log('  The blockchain contains non-zero amounts in HEX format');
			console.log('  But the UI uses parseFloat() which cannot parse hex strings');
			console.log('  This causes all amounts to appear as 0 in the user interface');

			console.log('\n🔧 SOLUTION:');
			console.log('  Fix the amount parsing in user-transaction.service.ts');
			console.log('  Replace parseFloat() with proper hex-aware parsing');

			console.log('\n📋 Next Steps:');
			console.log('  1. Run the database diagnostic script to confirm transactions are stored');
			console.log('  2. Fix the parseFloat issue in user-transaction.service.ts');
			console.log('  3. Test with the problematic address');
		} else {
			console.log('\n🤔 UNEXPECTED: All amounts are zero');
			console.log('  This suggests a different issue - all transactions have 0 amounts');
			console.log('  This could indicate fee-only transactions or a different problem');
		}

		// 6. Diagnostic commands
		console.log('\n🔍 Step 6: Diagnostic Commands to Run...');

		console.log('\n1. Run database diagnostic:');
		console.log('   node scripts/debug-db-amounts.js');

		console.log('\n2. Check specific transaction hashes in database:');
		analyzedEvents.forEach((event, index) => {
			console.log(
				`   SELECT * FROM user_transactions WHERE transaction_hash = '${event.transactionHash}';`
			);
		});

		console.log('\n3. Check if address is registered:');
		console.log(`   SELECT * FROM user_addresses WHERE starknet_address = '${PROBLEM_ADDRESS}';`);
	} catch (error) {
		console.error('❌ Error analyzing blockchain events:', error);
		console.error('Stack:', error.stack);
	}

	console.log('\n✨ Blockchain event analysis complete');
}

// Run the analysis
analyzeBlockchainEvents().catch(console.error);
