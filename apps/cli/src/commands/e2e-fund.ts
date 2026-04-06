import {StarknetAddress} from '@bim/domain/account';
import {createInterface} from 'node:readline';
import {RPC_URLS} from '../config/constants.js';
import {loadSecrets, requireE2e, requireTreasury} from '../config/secrets.js';
import {createCliGateways, Treasury} from '../core';
import {formatWbtc} from '../lib/format.js';

const DEFAULT_AMOUNT_SATS = 10_000n;

type AccountTarget = 'a' | 'b';

function parseArgs(args: string[]): {target: AccountTarget; amount: bigint} {
  const rawTarget = args[0]?.toLowerCase();
  if (rawTarget !== 'a' && rawTarget !== 'b') {
    console.error('Usage: ./bim e2e:fund <a|b> [amount_sats]');
    process.exit(1);
  }
  const amount = args[1] ? BigInt(args[1]) : DEFAULT_AMOUNT_SATS;
  return {target: rawTarget, amount};
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  return new Promise(resolve => {
    rl.question(`${message} (y/N) `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function run(args: string[]): Promise<void> {
  const {target, amount} = parseArgs(args);

  const secrets = loadSecrets();
  const treasurySecrets = requireTreasury(secrets, 'mainnet');
  const e2e = requireE2e(secrets);
  const {starknet} = createCliGateways('mainnet', secrets.avnu?.apiKey ?? '');

  const treasury = new Treasury(starknet, RPC_URLS.mainnet, treasurySecrets.address, treasurySecrets.privateKey);
  const targetAccount = target === 'a' ? e2e.accountA : e2e.accountB;
  const targetLabel = target === 'a' ? 'Account A' : 'Account B';

  if (args[1]) {
    console.log(`Crediting ${targetLabel} with ${formatWbtc(amount)}`);
  } else {
    console.log(`Crediting ${targetLabel} with ${formatWbtc(amount)} (default)`);
  }

  const balance = await treasury.getBalance();
  const targetAddr = StarknetAddress.of(targetAccount.starknetAddress);
  const targetBalance = await starknet.getBalance({address: targetAddr, token: 'WBTC'});

  console.log(`\nTreasury:    ${formatWbtc(balance.wbtc)}`);
  console.log(`${targetLabel}: ${formatWbtc(targetBalance)} (${targetAccount.username})`);

  if (balance.wbtc < amount) {
    throw new Error(
      `Insufficient treasury balance. Need ${formatWbtc(amount)}, have ${formatWbtc(balance.wbtc)}.`,
    );
  }

  const confirmed = await confirm(`\nSend ${formatWbtc(amount)} to ${targetLabel}?`);
  if (!confirmed) {
    console.log('Aborted.');
    return;
  }

  console.log(`\nTransferring ${formatWbtc(amount)}...`);
  const txHash = await treasury.fund(targetAddr, amount);
  console.log(`Tx hash: ${txHash}`);

  const balanceAfter = await starknet.getBalance({address: targetAddr, token: 'WBTC'});
  console.log(`${targetLabel} balance after: ${formatWbtc(balanceAfter)}`);

  const treasuryAfter = await treasury.getBalance();
  console.log(`Treasury balance after: ${formatWbtc(treasuryAfter.wbtc)}`);
  console.log('Done.');
}
