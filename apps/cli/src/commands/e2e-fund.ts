import {createInterface} from 'node:readline';
import {WBTC_TOKEN_ADDRESS} from '../config/constants.js';
import {loadSecrets, requireE2e, requireTreasury} from '../config/secrets.js';
import {formatWbtc} from '../lib/format.js';
import {createAccount, createProvider, getWbtcBalance} from '../lib/starknet.js';

const DEFAULT_AMOUNT_SATS = 10_000n;

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
  const amountPerAccount = args[0] ? BigInt(args[0]) : DEFAULT_AMOUNT_SATS;

  if (args[0]) {
    console.log(`Crediting each E2E account with ${formatWbtc(amountPerAccount)}`);
  } else {
    console.log(`Crediting each E2E account with ${formatWbtc(amountPerAccount)} (default)`);
  }

  const secrets = loadSecrets();
  const treasury = requireTreasury(secrets, 'mainnet');
  const e2e = requireE2e(secrets);

  const provider = createProvider('mainnet');

  const treasuryBalance = await getWbtcBalance(provider, treasury.address);
  const balanceA = await getWbtcBalance(provider, e2e.accountA.starknetAddress);
  const balanceB = await getWbtcBalance(provider, e2e.accountB.starknetAddress);

  console.log(`\nTreasury:  ${formatWbtc(treasuryBalance)}`);
  console.log(`Account A: ${formatWbtc(balanceA)} (${e2e.accountA.username})`);
  console.log(`Account B: ${formatWbtc(balanceB)} (${e2e.accountB.username})`);

  const totalNeeded = amountPerAccount * 2n;
  if (treasuryBalance < totalNeeded) {
    throw new Error(
      `Insufficient treasury balance. Need ${formatWbtc(totalNeeded)}, have ${formatWbtc(treasuryBalance)}.`,
    );
  }

  const confirmed = await confirm(`\nSend ${formatWbtc(amountPerAccount)} to each E2E account?`);
  if (!confirmed) {
    console.log('Aborted.');
    return;
  }

  const account = createAccount(provider, treasury);

  const targets = [
    {name: 'Account A', address: e2e.accountA.starknetAddress},
    {name: 'Account B', address: e2e.accountB.starknetAddress},
  ];

  for (const target of targets) {
    console.log(`\n${target.name}: transferring ${formatWbtc(amountPerAccount)}...`);

    const {transaction_hash: txHash} = await account.execute({
      contractAddress: WBTC_TOKEN_ADDRESS,
      entrypoint: 'transfer',
      calldata: [target.address, amountPerAccount.toString(), '0'],
    });
    console.log(`  Tx hash: ${txHash}`);
    console.log(`  Waiting for confirmation...`);

    await provider.waitForTransaction(txHash);

    const balanceAfter = await getWbtcBalance(provider, target.address);
    console.log(`  Balance after: ${formatWbtc(balanceAfter)}`);
  }

  const treasuryAfter = await getWbtcBalance(provider, treasury.address);
  console.log(`\nTreasury balance after: ${formatWbtc(treasuryAfter)}`);
  console.log('Done.');
}
