import {type SerializedAuthenticator, WebauthnVirtualAuthenticator,} from '@bim/test-toolkit/auth';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Logger} from 'pino';
import type {GetBalanceResponse} from '../../../src/routes';
import {loginUser} from './e2e-auth.js';
import type {E2eClient} from './e2e-client.js';
import {type AccountKey, E2eUser} from './e2e-user.js';

// =============================================================================
// Types
// =============================================================================

export interface E2eAccountData {
  username: string;
  starknetAddress: string;
  authenticator: SerializedAuthenticator;
}

export interface E2eSecretFile {
  accountA: E2eAccountData;
  accountB: E2eAccountData;
}

export interface TransferPair {
  sender: E2eUser;
  receiver: E2eUser;
}

export type SenderStrategy = 'smallest' | 'largest';

// =============================================================================
// Secret file path
// =============================================================================

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'apps', 'cli');
const SECRET_FILE = join(CLI_DIR, '.secrets.json');

// =============================================================================
// Load / Save
// =============================================================================

export function loadSecretFile(): E2eSecretFile {
  let raw: string;
  try {
    raw = readFileSync(SECRET_FILE, 'utf-8');
  } catch {
    throw new Error(
      `Secrets file not found: ${SECRET_FILE}\n` +
      'Run: ./bim e2e:init',
    );
  }

  const secrets = JSON.parse(raw) as {e2e?: E2eSecretFile};
  if (!secrets.e2e) {
    throw new Error(
      'No "e2e" section in .secrets.json.\nRun: ./bim e2e:init',
    );
  }
  return secrets.e2e;
}

/**
 * Persists a single account's authenticator state (signCount) to .secrets.json.
 * Called immediately after each successful login to avoid signCount desync.
 */
export function persistAuthenticator(
  accountKey: AccountKey,
  authenticator: WebauthnVirtualAuthenticator,
): void {
  const fullSecrets = JSON.parse(readFileSync(SECRET_FILE, 'utf-8')) as Record<string, unknown>;
  const e2e = fullSecrets.e2e as E2eSecretFile;
  e2e[accountKey] = {
    ...e2e[accountKey],
    authenticator: authenticator.serialize(),
  };
  writeFileSync(SECRET_FILE, JSON.stringify(fullSecrets, undefined, 2) + '\n');
}

// =============================================================================
// Login + Balance
// =============================================================================

/**
 * Loads both accounts from .secrets.json, logs in, fetches balances,
 * and determines sender (based on strategy) / receiver.
 */
export async function loadAndLoginAccounts(
  client: E2eClient,
  rootLogger: Logger,
  minBalanceSats: bigint,
  senderStrategy: SenderStrategy = 'largest',
): Promise<{
  secrets: E2eSecretFile;
  pair: TransferPair;
}> {
  const log = rootLogger.child({name: 'e2e-accounts.ts'});
  const secrets = loadSecretFile();

  log.info('Logging in account A...');
  const accountA = await loginAndBuildUser(client, secrets.accountA, 'accountA');
  log.info({
    username: accountA.username,
    wbtcBalance: accountA.getCurrentWbtcBalance().toString(),
    strkBalance: accountA.getCurrentStrkBalance().toString(),
  }, 'Account A ready');

  log.info('Logging in account B...');
  const accountB = await loginAndBuildUser(client, secrets.accountB, 'accountB');
  log.info({
    username: accountB.username,
    wbtcBalance: accountB.getCurrentWbtcBalance().toString(),
    strkBalance: accountB.getCurrentStrkBalance().toString(),
  }, 'Account B ready');

  const requiredBalance = minBalanceSats * 3n / 2n;

  const pair: TransferPair = senderStrategy === 'smallest'
    ? pickSmallestSender(accountA, accountB, requiredBalance)
    : pickLargestSender(accountA, accountB, requiredBalance);

  log.info({
    sender: pair.sender.username,
    senderWbtc: pair.sender.getCurrentWbtcBalance().toString(),
    receiver: pair.receiver.username,
    receiverWbtc: pair.receiver.getCurrentWbtcBalance().toString(),
    strategy: senderStrategy,
  }, `Transfer pair determined (strategy = ${senderStrategy})`);

  return {secrets, pair};
}

function pickSmallestSender(
  accountA: E2eUser,
  accountB: E2eUser,
  requiredBalance: bigint,
): TransferPair {
  const aBalance = accountA.getCurrentWbtcBalance();
  const bBalance = accountB.getCurrentWbtcBalance();
  const smaller = aBalance <= bBalance
    ? {account: accountA, other: accountB}
    : {account: accountB, other: accountA};

  if (smaller.account.getCurrentWbtcBalance() >= requiredBalance) {
    return {sender: smaller.account, receiver: smaller.other};
  }
  if (smaller.other.getCurrentWbtcBalance() >= requiredBalance) {
    return {sender: smaller.other, receiver: smaller.account};
  }
  throw new Error(
    `Neither account has sufficient WBTC:\n` +
    `  ${smaller.account.username}: ${smaller.account.getCurrentWbtcBalance()} sats\n` +
    `  ${smaller.other.username}: ${smaller.other.getCurrentWbtcBalance()} sats\n` +
    `  Required: ${requiredBalance} sats\n` +
    `Fund with: ./bim e2e:fund`,
  );
}

function pickLargestSender(
  accountA: E2eUser,
  accountB: E2eUser,
  requiredBalance: bigint,
): TransferPair {
  const pair: TransferPair = accountA.getCurrentWbtcBalance() >= accountB.getCurrentWbtcBalance()
    ? {sender: accountA, receiver: accountB}
    : {sender: accountB, receiver: accountA};

  if (pair.sender.getCurrentWbtcBalance() < requiredBalance) {
    throw new Error(
      `Sender ${pair.sender.username} has insufficient WBTC: ` +
      `${pair.sender.getCurrentWbtcBalance()} sats < ${requiredBalance} sats required.\n` +
      `Fund with: ./bim e2e:fund`,
    );
  }
  return pair;
}

async function loginAndBuildUser(
  client: E2eClient,
  accountData: E2eAccountData,
  accountKey: AccountKey,
): Promise<E2eUser> {
  const authenticator = WebauthnVirtualAuthenticator.deserialize(accountData.authenticator);
  const {sessionCookie} = await loginUser(client, authenticator);

  // Persist signCount immediately after successful login to avoid desync
  persistAuthenticator(accountKey, authenticator);

  const balanceResponse = await client.get('/api/account/balance', {
    headers: {Cookie: sessionCookie},
  });

  if (balanceResponse.status !== 200) {
    throw new Error(`Failed to get balance for ${accountData.username} (HTTP ${balanceResponse.status})`);
  }

  const balance = await balanceResponse.json() as GetBalanceResponse;

  return new E2eUser(client, persistAuthenticator, {
    username: accountData.username,
    starknetAddress: accountData.starknetAddress,
    authenticator,
    accountKey,
    sessionCookie,
    wbtcBalance: BigInt(balance.wbtcBalance.amount),
    strkBalance: BigInt(balance.strkBalance.amount),
  });
}
