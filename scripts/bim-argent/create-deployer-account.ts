import { stark, ec, hash, CallData } from 'starknet';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// USAGE: npx tsx scripts/create-deployer-account.ts
//
// This script creates a "deployer" account on Starknet. This is a standard
// OpenZeppelin account used for admin operations (declaring contracts, etc.).
// It is NOT a user-facing WebAuthn account — it's a utility account that signs
// transactions with a traditional STARK private key.
//
// On Starknet, every account is a smart contract. Creating one means:
//   1. Generate a STARK key pair (private + public)
//   2. Compute the future account address deterministically from the public key
//      and the account contract class hash (similar to CREATE2 on Ethereum)
//   3. Fund that address with tokens (via a faucet on testnet)
//   4. Deploy the account contract on-chain (separate script)
//
// The output is saved to scripts/.deployer-account.json (gitignored, contains
// the private key). This file is used by the deploy and declare scripts.

// OpenZeppelin account class hash — identifies the standard OZ account contract
// code on Starknet. Each deployed account is an instance of this code with its
// own address and key pair. This hash is already declared on both Sepolia and Mainnet.
const OZ_ACCOUNT_CLASS_HASH = '0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688';

const FAUCET_URL = 'https://starknet-faucet.vercel.app/';

function createAccount() {
  // Generate a random STARK-compatible private key
  const privateKey = stark.randomAddress();

  // Derive the corresponding public key on the STARK curve
  const publicKey = ec.starkCurve.getStarkKey(privateKey);

  // The constructor calldata is what gets passed to the account contract
  // on deployment. For an OZ account, it's just the public key.
  const constructorCallData = CallData.compile({ publicKey });

  // Deterministically compute the account address from:
  //   - salt: the public key (ensures uniqueness per key pair)
  //   - classHash: which contract code to use (OZ account)
  //   - constructorCallData: initialization parameters
  //   - deployerAddress: 0 means self-deployed (no factory contract)
  const address = hash.calculateContractAddressFromHash(
    publicKey,
    OZ_ACCOUNT_CLASS_HASH,
    constructorCallData,
    0,
  );

  return { privateKey, publicKey, address, classHash: OZ_ACCOUNT_CLASS_HASH };
}

function main() {
  const account = createAccount();

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outPath = join(scriptDir, '.deployer-account.json');

  writeFileSync(outPath, JSON.stringify(account, null, 2) + '\n');

  console.log('=== Deployer Account Created ===\n');
  console.log('Address:     ', account.address);
  console.log('Public key:  ', account.publicKey);
  console.log('Saved to:    ', outPath);
  console.log('\n--- Next steps ---');
  console.log(`1. Go to ${FAUCET_URL}`);
  console.log('2. Paste the address above and request STRK');
  console.log('3. Run: npx tsx scripts/deploy-deployer-account.ts');
}

main();
