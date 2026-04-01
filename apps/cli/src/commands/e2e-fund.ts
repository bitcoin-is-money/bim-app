import {WBTC_TOKEN_ADDRESS} from '../config/constants.js';
import {loadSecrets, requireE2e, requireTreasury} from '../config/secrets.js';
import {formatWbtc} from '../lib/format.js';
import {createAccount, createProvider, getWbtcBalance} from '../lib/starknet.js';

const DEFAULT_AMOUNT_SATS = 10_000n;

export async function run(args: string[]): Promise<void> {
  const amountPerAccount = args[0] ? BigInt(args[0]) : DEFAULT_AMOUNT_SATS;

  const secrets = loadSecrets();
  const treasury = requireTreasury(secrets, 'mainnet');
  const e2e = requireE2e(secrets);

  const provider = createProvider('mainnet');
  const account = createAccount(provider, treasury);

  console.log('Treasury:', treasury.address);
  console.log(`Amount per account: ${formatWbtc(amountPerAccount)}\n`);

  const treasuryBalance = await getWbtcBalance(provider, treasury.address);
  console.log(`Treasury WBTC balance: ${formatWbtc(treasuryBalance)}`);

  const totalNeeded = amountPerAccount * 2n;
  if (treasuryBalance < totalNeeded) {
    throw new Error(
      `Insufficient treasury balance. Need ${formatWbtc(totalNeeded)}, have ${formatWbtc(treasuryBalance)}.`,
    );
  }

  const targets = [
    {name: 'Account A', address: e2e.accountA.starknetAddress, username: e2e.accountA.username},
    {name: 'Account B', address: e2e.accountB.starknetAddress, username: e2e.accountB.username},
  ];

  for (const target of targets) {
    const balanceBefore = await getWbtcBalance(provider, target.address);
    console.log(`\n${target.name} (${target.username}):`);
    console.log(`  Address: ${target.address}`);
    console.log(`  Balance before: ${formatWbtc(balanceBefore)}`);
    console.log(`  Transferring ${formatWbtc(amountPerAccount)}...`);

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
}
