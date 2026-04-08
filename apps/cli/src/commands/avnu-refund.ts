import {StarknetAddress} from '@bim/domain/account';
import {createLogger} from '@bim/lib/logger';
import {AvnuCreditsRecharged} from '@bim/domain/notifications';
import type {NotificationGateway} from '@bim/domain/ports';
import {SlackNotificationGateway} from '@bim/slack';
import {createInterface} from 'node:readline';
import {RPC_URLS, STRK_DECIMALS} from '../config/constants.js';
import {loadSecrets, requireAvnu, requireTreasury} from '../config/secrets.js';
import {AvnuPaymaster, createCliGateways, Treasury} from '../core';
import {formatStrk, formatWbtc} from '../lib/format.js';

const DEFAULT_AMOUNT_STRK = 10n;
const CREDITS_POLL_INTERVAL_MS = 3_000;
const CREDITS_POLL_TIMEOUT_MS = 30_000;

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  return new Promise(resolve => {
    rl.question(`${message} (y/N) `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function waitForCreditsIncrease(
  avnu: AvnuPaymaster,
  previousBalance: bigint,
): Promise<bigint | undefined> {
  const deadline = Date.now() + CREDITS_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const current = await avnu.getCredits();
      if (current > previousBalance) {
        return current;
      }
    } catch (err: unknown) {
      console.warn(
        'getCredits() failed during poll:',
        err instanceof Error ? err.message : String(err),
      );
    }
    const elapsedSec = Math.floor((CREDITS_POLL_TIMEOUT_MS - (deadline - Date.now())) / 1000);
    console.log(`Waiting for AVNU credits to update... (${elapsedSec}s)`);
    await new Promise(resolve => setTimeout(resolve, CREDITS_POLL_INTERVAL_MS));
  }
  return undefined;
}

export async function run(args: string[]): Promise<void> {
  const amountStrk = args[0] ? BigInt(args[0]) : DEFAULT_AMOUNT_STRK;
  const amountWei = amountStrk * 10n ** BigInt(STRK_DECIMALS);

  const secrets = loadSecrets();
  const treasurySecrets = requireTreasury(secrets, 'mainnet');
  const avnuSecrets = requireAvnu(secrets);
  const {starknet, paymaster} = createCliGateways('mainnet', avnuSecrets.apiKey);

  const treasury = new Treasury(starknet, RPC_URLS.mainnet, treasurySecrets.address, treasurySecrets.privateKey);
  const avnu = new AvnuPaymaster(paymaster);

  const balance = await treasury.getBalance();

  if (args[0]) {
    console.log(`Refunding AVNU paymaster with ${formatStrk(amountWei)}`);
  } else {
    console.log(`Refunding AVNU paymaster with ${formatStrk(amountWei)} (default)`);
  }

  console.log();
  console.log('-- BIM Treasury --');
  console.log(`Address:  ${balance.address}`);
  console.log(`STRK:     ${formatStrk(balance.strk)}`);
  console.log(`WBTC:     ${formatWbtc(balance.wbtc)}`);

  if (balance.strk < amountWei) {
    throw new Error(
      `Insufficient STRK balance. Need ${formatStrk(amountWei)}, have ${formatStrk(balance.strk)}.`,
    );
  }

  const confirmed = await confirm(`\nSend ${formatStrk(amountWei)} to AVNU paymaster?`);
  if (!confirmed) {
    console.log('Aborted.');
    return;
  }

  let previousBalance: bigint | undefined;
  try {
    previousBalance = await avnu.getCredits();
  } catch (err: unknown) {
    console.warn(
      'Could not read AVNU credits before refund:',
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log('\nSending transaction (approve + funding)...');
  const txHash = await avnu.refund(
    RPC_URLS.mainnet,
    StarknetAddress.of(treasurySecrets.address),
    treasurySecrets.privateKey,
    amountWei,
    avnuSecrets,
  );
  console.log(`Tx hash: ${txHash}`);
  console.log(`Done. ${formatStrk(amountWei)} credited to AVNU paymaster.`);

  try {
    if (previousBalance === undefined) {
      console.log('Skipping notification: previous balance unavailable.');
      return;
    }
    const currentBalance = await waitForCreditsIncrease(avnu, previousBalance);
    if (currentBalance === undefined) {
      console.log('Skipping notification: balance did not increase within 30s.');
      return;
    }
    const message = AvnuCreditsRecharged.evaluate({
      address: StarknetAddress.of(treasurySecrets.address),
      network: 'mainnet',
      previousBalance,
      currentBalance,
    });
    if (!message) {
      console.log('Skipping notification: new balance not higher than previous.');
      return;
    }
    if (!secrets.slack) {
      console.log('Skipping notification: no slack configured in .secrets.json.');
      return;
    }
    const logger = createLogger('silent');
    const notifier: NotificationGateway = new SlackNotificationGateway(secrets.slack, logger);
    await notifier.send(message);
    console.log('Slack notification sent.');
  } catch (err: unknown) {
    console.warn(
      'Failed to send recharge notification:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
