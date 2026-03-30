import {Account, RpcProvider, CallData, Signer} from 'starknet';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// USAGE: npx tsx scripts/admin-account/deploy.ts <testnet|mainnet>
//
// Deploys the admin account on-chain. Must be run AFTER create.ts
// and AFTER funding the address.

const RPC_URLS: Record<Network, string> = {
  testnet: 'https://api.cartridge.gg/x/starknet/sepolia',
  mainnet: 'https://api.cartridge.gg/x/starknet/mainnet',
};

const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

type Network = 'testnet' | 'mainnet';

function parseNetwork(): Network {
  const arg = process.argv[2];
  if (arg !== 'testnet' && arg !== 'mainnet') {
    console.error('Usage: npx tsx scripts/admin-account/deploy.ts <testnet|mainnet>');
    process.exit(1);
  }
  return arg;
}

function loadAccount(network: Network): {
  privateKey: string;
  publicKey: string;
  address: string;
  classHash: string;
} {
  const filePath = join(SCRIPT_DIR, `.treasury.${network}.secret.json`);

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    console.error(`Account file not found: ${filePath}`);
    console.error(`Run: npx tsx scripts/admin-account/create.ts ${network}`);
    process.exit(1);
  }
}

async function getStrkBalance(provider: RpcProvider, address: string): Promise<bigint> {
  const result = await provider.callContract({
    contractAddress: STRK_TOKEN_ADDRESS,
    entrypoint: 'balanceOf',
    calldata: [address],
  });
  const raw = result[0];
  if (raw === undefined) throw new Error('balanceOf returned empty result');
  return BigInt(raw);
}

async function main(): Promise<void> {
  const network = parseNetwork();
  const {privateKey, publicKey, address, classHash} = loadAccount(network);
  const provider = new RpcProvider({nodeUrl: RPC_URLS[network]});

  console.log(`Deploying admin account on ${network}...`);
  console.log('Address:', address);

  const balance = await getStrkBalance(provider, address);
  if (balance === 0n) {
    console.error('\nAccount has no STRK. Fund it first.');
    if (network === 'testnet') {
      console.error('  Faucet: https://starknet-faucet.vercel.app/');
    }
    console.error('  Address:', address);
    process.exit(1);
  }
  console.log('STRK balance:', balance.toString(), 'wei\n');

  const signer = new Signer(privateKey);
  const account = new Account({provider, address, signer});
  const constructorCallData = CallData.compile({publicKey});

  const {transaction_hash, contract_address} = await account.deployAccount({
    classHash,
    constructorCalldata: constructorCallData,
    addressSalt: publicKey,
  });

  console.log('Transaction hash:', transaction_hash);
  console.log('Waiting for confirmation...');

  await provider.waitForTransaction(transaction_hash);

  console.log('\n=== Account Deployed ===');
  console.log('Address:', contract_address);
  console.log('\nAdd to your .env:');
  console.log(`  CLAIMER_ADDRESS=${contract_address}`);
  console.log('  CLAIMER_PRIVATE_KEY=<see .treasury.' + network + '.secret.json>');
}

main().catch((err: unknown) => {
  console.error('Deployment failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
