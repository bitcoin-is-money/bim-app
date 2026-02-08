import { Account, RpcProvider, Signer } from 'starknet';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// USAGE: npx tsx scripts/declare-contract.ts
//
// This script declares the BIM Argent 0.5.0 contract on Starknet Sepolia.
// It must be run AFTER deploy-deployer-account.ts.
//
// "Declaring" a contract means publishing its code on-chain. Once declared,
// anyone can deploy instances (user accounts) that use this code.
// The contract is already declared on Mainnet — this script fetches the
// Sierra (source-level bytecode) from Mainnet and re-declares it on Sepolia.
//
// A declare transaction requires two hashes:
//   - classHash: identifies the Sierra code (computed automatically by starknet.js)
//   - compiledClassHash: identifies the CASM (low-level compiled code).
//     This is a security measure — it proves the CASM matches the Sierra.
//     We pre-computed it using starknet.py's compute_casm_class_hash.

// BIM Argent 0.5.0 — Modified Argent wallet with WebAuthn signature validation.
const BIM_CLASS_HASH = '0x04bc5b0950521985d3f8db954fc6ae3832122c6ee4cd770efdbf87437699ce48';

// Pre-computed CASM hash for this contract (computed from Mainnet CASM via starknet.py).
const COMPILED_CLASS_HASH = '0xc12444dab1aaa9d1c7fc5d2ca7f51660a1607fb01143da42ebc93a2a30479d';

const MAINNET_RPC = 'https://api.cartridge.gg/x/starknet/mainnet';
const SEPOLIA_RPC = 'https://api.cartridge.gg/x/starknet/sepolia';

function loadAccount() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const filePath = join(scriptDir, '.deployer-account.json');
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    console.error('Account file not found. Run create-deployer-account.ts first.');
    process.exit(1);
  }
}

// Fetch the Sierra contract class from Mainnet where it's already declared.
async function fetchSierraFromMainnet(): Promise<any> {
  console.log('Fetching Sierra from Mainnet...');
  const provider = new RpcProvider({ nodeUrl: MAINNET_RPC });
  const sierra = await provider.getClass(BIM_CLASS_HASH);
  console.log('Sierra fetched (version:', sierra.contract_class_version, ')\n');
  return sierra;
}

// Check if the class is already declared on Sepolia (idempotent).
async function isAlreadyDeclared(provider: RpcProvider): Promise<boolean> {
  try {
    await provider.getClass(BIM_CLASS_HASH);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { privateKey, address } = loadAccount();
  const provider = new RpcProvider({ nodeUrl: SEPOLIA_RPC });

  // Skip if already declared (makes the script idempotent)
  if (await isAlreadyDeclared(provider)) {
    console.log('Contract is already declared on Sepolia. Nothing to do.');
    console.log('Class hash:', BIM_CLASS_HASH);
    return;
  }

  const sierra = await fetchSierraFromMainnet();

  const signer = new Signer(privateKey);
  const account = new Account({ provider, address, signer });

  console.log('Declaring contract on Sepolia...');
  const { transaction_hash, class_hash } = await account.declare({
    contract: sierra,
    compiledClassHash: COMPILED_CLASS_HASH,
  });

  console.log('Transaction hash:', transaction_hash);
  console.log('Waiting for confirmation...');

  await provider.waitForTransaction(transaction_hash);

  console.log('\n=== Contract Declared on Sepolia ===');
  console.log('Class hash:', class_hash);
}

main().catch((err) => {
  console.error('Declaration failed:', err.message);
  process.exit(1);
});
