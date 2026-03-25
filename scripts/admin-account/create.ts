import {stark, ec, hash, CallData} from 'starknet';
import {existsSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// USAGE: npx tsx scripts/admin-account/create.ts <testnet|mainnet>
//
// Generates a new BIM admin account (OpenZeppelin) for the given network.
// This is a standard Starknet account with a STARK private key, used for:
//   - Auto-claiming forward swaps (claimer bounty recovery)
//   - BIM fee collection (future)
//   - Admin operations (contract declarations, etc.)
//
// The output is saved to scripts/admin-account/.account.<network>.json
// (gitignored — contains the private key).
//
// After creation:
//   1. Fund the address (faucet on testnet, transfer on mainnet)
//   2. Deploy: npx tsx scripts/admin-account/deploy.ts <network>

const OZ_ACCOUNT_CLASS_HASH = '0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688';
const FAUCET_URL = 'https://starknet-faucet.vercel.app/';

type Network = 'testnet' | 'mainnet';

function parseNetwork(): Network {
  const arg = process.argv[2];
  if (arg !== 'testnet' && arg !== 'mainnet') {
    console.error('Usage: npx tsx scripts/admin-account/create.ts <testnet|mainnet>');
    process.exit(1);
  }
  return arg;
}

function getAccountPath(network: Network): string {
  return join(SCRIPT_DIR, `.account.${network}.json`);
}

function main(): void {
  const network = parseNetwork();
  const outPath = getAccountPath(network);

  if (existsSync(outPath)) {
    console.error(`Account file already exists: ${outPath}`);
    console.error('Delete it first if you want to regenerate.');
    process.exit(1);
  }

  const privateKey = stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  const constructorCallData = CallData.compile({publicKey});
  const address = hash.calculateContractAddressFromHash(
    publicKey,
    OZ_ACCOUNT_CLASS_HASH,
    constructorCallData,
    0,
  );

  const account = {privateKey, publicKey, address, classHash: OZ_ACCOUNT_CLASS_HASH};
  writeFileSync(outPath, JSON.stringify(account, null, 2) + '\n');

  console.log(`=== Admin Account Created (${network}) ===\n`);
  console.log('Address:     ', address);
  console.log('Public key:  ', publicKey);
  console.log('Saved to:    ', outPath);
  console.log('\n--- Next steps ---');
  if (network === 'testnet') {
    console.log(`1. Go to ${FAUCET_URL}`);
    console.log('2. Paste the address above and request STRK');
  } else {
    console.log('1. Transfer STRK to the address above');
  }
  console.log(`3. Run: npx tsx scripts/admin-account/deploy.ts ${network}`);
}

main();
