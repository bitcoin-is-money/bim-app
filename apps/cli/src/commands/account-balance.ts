import {StarknetAddress} from '@bim/domain/account';
import type {StarknetRpcGateway} from '@bim/starknet';
import {type Network, RPC_URLS} from '../config/constants.js';
import type {E2eAccountSecrets} from '../config/secrets.js';
import {loadSecrets, requireTreasury} from '../config/secrets.js';
import {AvnuPaymaster, createCliGateways, Treasury} from '../core';
import {bigintReplacer, formatStrk, formatWbtc} from '../lib/format.js';

interface AccountBalanceInfo {
  readonly label: string;
  readonly username: string;
  readonly address: string;
  readonly wbtc: bigint;
  readonly strk: bigint;
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

function printHuman(
  network: Network,
  balance: {address: string; strk: bigint; wbtc: bigint},
  avnu: AvnuPaymaster | undefined,
  credits: bigint | undefined,
  e2eAccounts: AccountBalanceInfo[] | undefined,
): void {
  console.log(`Network:  ${network}`);
  console.log();
  console.log('-- BIM Treasury --');
  console.log(`Address:  ${balance.address}`);
  console.log(`STRK:     ${formatStrk(balance.strk)}`);
  console.log(`WBTC:     ${formatWbtc(balance.wbtc)}`);
  console.log();

  if (avnu) {
    console.log('-- AVNU Paymaster Credits --');
    const creditsLabel = credits === undefined ? '(unable to fetch — check API key)' : formatStrk(credits);
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
    console.log(`WBTC:     ${formatWbtc(acc.wbtc)}`);
    console.log(`STRK:     ${formatStrk(acc.strk)}`);
  }
}

async function run(args: string[]): Promise<void> {
  const jsonMode = args.includes('--json');
  const positional = args.filter(a => !a.startsWith('--'));
  const network = parseNetwork(positional);
  const secrets = loadSecrets();
  const treasurySecrets = requireTreasury(secrets, network);
  const {starknet, paymaster} = createCliGateways(network, secrets.avnu?.apiKey ?? '');

  const treasury = new Treasury(starknet, RPC_URLS[network], treasurySecrets.address, treasurySecrets.privateKey);
  const balance = await treasury.getBalance();

  const avnu = secrets.avnu ? new AvnuPaymaster(paymaster) : undefined;
  const credits = await fetchAvnuCredits(avnu);

  const e2eAccounts = network === 'mainnet' && secrets.e2e
    ? await fetchE2eBalances(starknet, [['Account A', secrets.e2e.accountA], ['Account B', secrets.e2e.accountB]])
    : undefined;

  if (jsonMode) {
    console.log(JSON.stringify({network, balance, credits, e2eAccounts}, bigintReplacer, 2));
    return;
  }

  printHuman(network, balance, avnu, credits, e2eAccounts);
}

export default run;
