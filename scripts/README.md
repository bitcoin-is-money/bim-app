# Blockchain Transaction Debug Scripts

This directory contains scripts for debugging blockchain scanning issues, specifically designed to analyze transactions and understand what our blockchain scanner is picking up vs. what's actually on the blockchain.

## Scripts

### 1. `debug-specific-transaction.js`

**Purpose**: Debug the specific transaction `0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196` that has known scanning issues.

**Usage**:

```bash
npm run debug:tx
```

**What it does**:

- Fetches the specific transaction details
- Gets the transaction receipt and all events
- Fetches Transfer events for the block
- Analyzes each Transfer event in detail
- Shows what our scanner would pick up
- Simulates our scanner logic
- Identifies any parsing issues

### 2. `debug-transaction.js`

**Purpose**: General-purpose transaction debugging script that can analyze any transaction hash.

**Usage**:

```bash
# Debug a specific transaction
npm run debug:tx:custom 0x1234...

# Debug with a target address to simulate scanner logic
npm run debug:tx:custom 0x1234... 0xabcd...
```

**What it does**:

- Fetches transaction details for any given hash
- Analyzes Transfer events
- Simulates blockchain scanner logic
- Shows what would be stored in our database
- Useful for debugging any transaction scanning issues

## Common Issues to Look For

### 1. Amount Parsing Issues

- **Zero amounts**: Events with `0x0` or empty amounts
- **Invalid hex**: Malformed hex strings that can't be parsed
- **Precision loss**: Large numbers that might be truncated

### 2. Event Structure Issues

- **Missing data**: Events with fewer than 3 data elements
- **Wrong event type**: Non-Transfer events being processed as transfers
- **Contract address mismatch**: Wrong contract address in `from_address` field

### 3. Address Normalization Issues

- **Leading zeros**: Addresses with different zero padding
- **Case sensitivity**: Mixed case addresses
- **0x prefix**: Inconsistent prefix handling

## Example Output

When running the debug script, you'll see output like:

```
🚀 Debugging Specific Transaction
==================================================
Target TX: 0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196

🔍 Step 1: Fetching transaction details...
✅ Transaction found
   Block: 12345678
   Status: ACCEPTED_ON_L2
   Type: INVOKE

📋 Step 2: Fetching transaction receipt...
✅ Receipt found
   Total events: 3

📊 All events in transaction:
   Event 1:
     Keys: 0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9
     Data: 0x1234..., 0xabcd..., 0x1000
     From: 0xcontract...

📡 Step 3: Fetching Transfer events for the block...
✅ Found 15 Transfer events in block 12345678
📊 Found 2 Transfer events for our transaction

🔍 Step 4: Analyzing Transfer events...

   Transfer Event 1:
   Transaction Hash: 0x7518321d0047441577cc69434e4f8a319db685a1ca6841a9a4a6f269008f196
   Block Number: 12345678
   Contract Address: 0xcontract...
   From Address: 0x1234...
   To Address: 0xabcd...
   Raw Amount: 0x1000
   Parsed Amount: 0x1000
   BigInt Value: 4096
   Is Zero: NO
   Normalized From: 1234
   Normalized To: abcd
```

## Troubleshooting

### If the script fails to run:

1. **Check Node.js version**: Ensure you're using Node.js 22.12.0 or higher
2. **Install dependencies**: Run `npm install` to ensure all packages are available
3. **Check RPC endpoint**: Verify the RPC URL in the script is accessible
4. **Network issues**: Ensure you can reach the Starknet RPC endpoint

### If no events are found:

1. **Transaction status**: Check if the transaction is confirmed and has a block number
2. **Event type**: Verify the transaction actually emits Transfer events
3. **Block range**: Ensure the block number is correct and accessible
4. **RPC limits**: Some RPC providers have rate limits or block range restrictions

## Integration with Blockchain Scanner

These scripts use the same logic as our `BlockchainScannerService`:

- **Address normalization**: Matches the `normalizeAddress` method
- **Amount parsing**: Uses the same hex parsing logic
- **Event filtering**: Applies the same Transfer event filtering
- **Data extraction**: Extracts the same fields (from, to, amount)

This ensures that what you see in the debug output matches exactly what our production scanner would process.

## Contributing

When adding new debugging features:

1. **Keep it focused**: Each script should have a single, clear purpose
2. **Match production logic**: Ensure debugging logic matches production code
3. **Add logging**: Include detailed logging to help identify issues
4. **Handle errors gracefully**: Don't crash on network or parsing errors
5. **Document usage**: Update this README with new script information
