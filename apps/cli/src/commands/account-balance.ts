import {StarknetAddress} from '@bim/domain/account';
import {formatSats, formatStrk} from '@bim/lib/token';
import type {StarknetRpcGateway} from '@bim/starknet';
import {getRpcUrl, type Network} from '../config/constants.js';
import type {E2eAccountSecrets} from '../config/secrets.js';
import {loadSecrets, requireTreasury} from '../config/secrets.js';
import {AvnuPaymaster, createCliGateways, Treasury} from '../core';
import {bigintReplacer, formatUsd} from '../lib/format.js';

interface AccountBalanceInfo {
  readonly label: string;
  readonly username: string;
  readonly address: string;
  readonly wbtc: bigint;
  readonly strk: bigint;
}

interface Prices {
  readonly btcUsd: number;
  readonly strkUsd: number;
}

const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,starknet&vs_currencies=usd';

async function fetchPrices(): Promise<Prices | undefined> {
  try {
    const response = await fetch(COINGECKO_PRICE_URL);
    if (!response.ok) return undefined;
    const data = (await response.json()) as {
      bitcoin?: { usd?: number };
      starknet?: { usd?: number };
    };
    const btcUsd = data.bitcoin?.usd;
    const strkUsd = data.starknet?.usd;
    if (btcUsd === undefined || strkUsd === undefined || btcUsd <= 0 || strkUsd <= 0) return undefined;
    return {btcUsd, strkUsd};
  } catch {
    return undefined;
  }
}

function wbtcToUsd(sats: bigint, btcUsd: number): number {
  return Number(sats) / 1e8 * btcUsd;
}

function strkToUsd(wei: bigint, strkUsd: number): number {
  return Number(wei) / 1e18 * strkUsd;
}

function parseNetwork(args: string[]): Network {
  const arg = args[0] ?? 'mainnet';
  if (arg !== 'testnet' && arg !== 'mainnet') {
    console.error('Usage: ./bim account:balance [testnet|mainnet]');
    process.exit(1);
  }
  return arg;
}

async function fetchAvnuCredits(avnu: AvnuPaymaster | undefined): Promise<bigint | undefined> {
  if (!avnu) return undefined;
  try {
    return await avnu.getCredits();
  } catch {
    return undefined;
  }
}

async function fetchE2eBalances(
  starknet: StarknetRpcGateway,
  accounts: readonly [string, E2eAccountSecrets][],
): Promise<AccountBalanceInfo[]> {
  const result: AccountBalanceInfo[] = [];
  for (const [label, account] of accounts) {
    const addr = StarknetAddress.of(account.starknetAddress);
    const wbtc = await starknet.getBalance({address: addr, token: 'WBTC'});
    const strk = await starknet.getBalance({address: addr, token: 'STRK'});
    result.push({label, username: account.username, address: account.starknetAddress, wbtc, strk});
  }
  return result;
}

function formatStrkWithUsd(wei: bigint, prices: Prices | undefined): string {
  const base = formatStrk(wei, true);
  if (!prices) return base;
  return `${base} (${formatUsd(strkToUsd(wei, prices.strkUsd))})`;
}

function formatWbtcWithUsd(sats: bigint, prices: Prices | undefined): string {
  const base = formatSats(sats, true);
  if (!prices) return base;
  return `${base} (${formatUsd(wbtcToUsd(sats, prices.btcUsd))})`;
}

function printHuman(
  network: Network,
  balance: {address: string; strk: bigint; wbtc: bigint},
  avnu: AvnuPaymaster | undefined,
  credits: bigint | undefined,
  e2eAccounts: AccountBalanceInfo[] | undefined,
  prices: Prices | undefined,
): void {
  console.log(`Network:  ${network}`);
  if (prices) {
    console.log(`BTC/USD:  ${formatUsd(prices.btcUsd)}  |  STRK/USD:  ${formatUsd(prices.strkUsd)}`);
  } else {
    console.log('Prices:   (unable to fetch from CoinGecko)');
  }
  console.log();
  console.log('-- BIM Treasury --');
  console.log(`Address:  ${balance.address}`);
  console.log(`STRK:     ${formatStrkWithUsd(balance.strk, prices)}`);
  console.log(`WBTC:     ${formatWbtcWithUsd(balance.wbtc, prices)}`);
  console.log();

  if (avnu) {
    console.log('-- AVNU Paymaster Credits --');
    const creditsLabel = credits === undefined ? '(unable to fetch — check API key)' : formatStrk(credits, true);
    console.log(`Credits:  ${creditsLabel}`);
  } else {
    console.log('-- AVNU --');
    console.log('No AVNU config in .secrets.json — skipping credit check.');
  }

  if (network !== 'mainnet') return;

  console.log();
  if (!e2eAccounts) {
    console.log('-- E2E Test Accounts --');
    console.log('Not created yet. Run: ./bim e2e:init');
    return;
  }
  for (const acc of e2eAccounts) {
    console.log(`-- E2E ${acc.label} (${acc.username}) --`);
    console.log(`Address:  ${acc.address}`);
    console.log(`WBTC:     ${formatWbtcWithUsd(acc.wbtc, prices)}`);
    console.log(`STRK:     ${formatStrkWithUsd(acc.strk, prices)}`);
  }
}

async function run(args: string[]): Promise<void> {
  const jsonMode = args.includes('--json');
  const positional = args.filter(a => !a.startsWith('--'));
  const network = parseNetwork(positional);
  const secrets = loadSecrets();
  const treasurySecrets = requireTreasury(secrets, network);
  const {starknet, paymaster} = createCliGateways(network, secrets.avnu?.apiKey ?? '');

  const treasury = new Treasury(starknet, getRpcUrl(network), treasurySecrets.address, treasurySecrets.privateKey);

  const avnu = secrets.avnu ? new AvnuPaymaster(paymaster) : undefined;

  // Fetch balance, credits, and prices in parallel
  const [balance, credits, prices] = await Promise.all([
    treasury.getBalance(),
    fetchAvnuCredits(avnu),
    fetchPrices(),
  ]);

  const e2eAccounts = network === 'mainnet' && secrets.e2e
    ? await fetchE2eBalances(starknet, [['Account A', secrets.e2e.accountA], ['Account B', secrets.e2e.accountB]])
    : undefined;

  if (jsonMode) {
    console.log(JSON.stringify({network, balance, credits, prices, e2eAccounts}, bigintReplacer, 2));
    return;
  }

  printHuman(network, balance, avnu, credits, e2eAccounts, prices);
}

export default run;
