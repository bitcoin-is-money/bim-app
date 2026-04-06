import {StarknetAddress} from '@bim/domain/account';
import {createInterface} from 'node:readline';
import {RPC_URLS, STRK_DECIMALS} from '../config/constants.js';
import {loadSecrets, requireAvnu, requireTreasury} from '../config/secrets.js';
import {AvnuPaymaster, createCliGateways, Treasury} from '../core';
import {formatStrk, formatWbtc} from '../lib/format.js';

const DEFAULT_AMOUNT_STRK = 10n;

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
}
