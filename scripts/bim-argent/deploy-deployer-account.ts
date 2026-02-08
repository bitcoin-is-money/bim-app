import { Account, RpcProvider, CallData, Signer } from 'starknet';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// USAGE: npx tsx scripts/deploy-deployer-account.ts
//
// This script deploys the deployer account on Starknet Sepolia.
// It must be run AFTER create-deployer-account.ts and AFTER funding
// the account address via the faucet.
//
// On Starknet, deploying an account means submitting a special
// "deploy_account" transaction that creates the smart contract instance
// at the pre-computed address. This costs gas, which is why the address
// must be funded before deployment.

const SEPOLIA_RPC = 'https://api.cartridge.gg/x/starknet/sepolia';

// STRK token contract address (same on Sepolia and Mainnet).
// The faucet sends STRK, so we check this token's balance.
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

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

// Check the STRK balance of an address by calling the ERC-20 balanceOf entrypoint.
// starknet.js v9 does not have a provider.getBalance() helper.
async function getStrkBalance(provider: RpcProvider, address: string): Promise<bigint> {
  const result = await provider.callContract({
    contractAddress: STRK_TOKEN_ADDRESS,
    entrypoint: 'balanceOf',
    calldata: [address],
  });
  // balanceOf returns a u256 as two felts [low, high]
  return BigInt(result[0]);
}

async function main() {
  const { privateKey, publicKey, address, classHash } = loadAccount();
  const provider = new RpcProvider({ nodeUrl: SEPOLIA_RPC });

  // Check the account has been funded before attempting deployment
  console.log('Checking STRK balance for', address, '...');
  const balance = await getStrkBalance(provider, address);

  if (balance === 0n) {
    console.error('\nAccount has no STRK. Fund it first via the faucet:');
    console.error('  https://starknet-faucet.vercel.app/');
    console.error('  Address:', address);
    process.exit(1);
  }
  console.log('STRK balance:', balance.toString(), 'wei\n');

  // Build and submit the deploy_account transaction
  console.log('Deploying account...');
  const signer = new Signer(privateKey);
  const account = new Account({ provider, address, signer });
  const constructorCallData = CallData.compile({ publicKey });

  const { transaction_hash, contract_address } = await account.deployAccount({
    classHash,
    constructorCalldata: constructorCallData,
    addressSalt: publicKey,
  });

  console.log('Transaction hash:', transaction_hash);
  console.log('Waiting for confirmation...');

  await provider.waitForTransaction(transaction_hash);

  console.log('\n=== Account Deployed ===');
  console.log('Address:', contract_address);
  console.log('\n--- Next step ---');
  console.log('Run: npx tsx scripts/declare-contract.ts');
}

main().catch((err) => {
  console.error('Deployment failed:', err.message);
  process.exit(1);
});
