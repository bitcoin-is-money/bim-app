import {RpcProvider} from 'starknet';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// USAGE: npx tsx scripts/admin-account/balance.ts <testnet|mainnet>
//
// Displays the STRK balance of the admin account for the given network.

const RPC_URLS: Record<Network, string> = {
  testnet: 'https://api.cartridge.gg/x/starknet/sepolia',
  mainnet: 'https://api.cartridge.gg/x/starknet/mainnet',
};

const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const STRK_DECIMALS = 18;
const AVNU_ADDRESS = '0x02698cf1e909bc26d684182ce66222f5a60588ccc6b455ee4622e3483208435f';

type Network = 'testnet' | 'mainnet';

function parseNetwork(): Network {
  const arg = process.argv[2];
  if (arg !== 'testnet' && arg !== 'mainnet') {
    console.error('Usage: npx tsx scripts/admin-account/balance.ts <testnet|mainnet>');
    process.exit(1);
  }
  return arg;
}

function loadAccount(network: Network): {address: string} {
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
  if (raw === undefined) {
    throw new Error('balanceOf returned empty result');
  }
  return BigInt(raw);
}

function formatStrk(wei: bigint): string {
  const whole = wei / 10n ** BigInt(STRK_DECIMALS);
  const fraction = wei % 10n ** BigInt(STRK_DECIMALS);
  const fractionStr = fraction.toString().padStart(STRK_DECIMALS, '0').slice(0, 6);
  return `${whole}.${fractionStr}`;
}

async function main(): Promise<void> {
  const network = parseNetwork();
  const {address} = loadAccount(network);
  const provider = new RpcProvider({nodeUrl: RPC_URLS[network]});

  const adminBalance = await getStrkBalance(provider, address);
  const avnuBalance = await getStrkBalance(provider, AVNU_ADDRESS);

  console.log(`Network:  ${network}`);
  console.log();
  console.log('── Admin (Treasury) ──');
  console.log(`Address:  ${address}`);
  console.log(`Balance:  ${formatStrk(adminBalance)} STRK`);
  console.log();
  console.log('── AVNU ──');
  console.log(`Address:  ${AVNU_ADDRESS}`);
  console.log(`Balance:  ${formatStrk(avnuBalance)} STRK`);
}

main().catch((err: unknown) => {
  console.error('Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
