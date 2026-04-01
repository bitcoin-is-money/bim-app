import {CallData} from 'starknet';
import type {Network} from '../config/constants.js';
import {loadSecrets, requireTreasury} from '../config/secrets.js';
import {formatStrk} from '../lib/format.js';
import {createAccount, createProvider, getStrkBalance} from '../lib/starknet.js';

function parseNetwork(args: string[]): Network {
  const arg = args[0];
  if (arg !== 'testnet' && arg !== 'mainnet') {
    console.error('Usage: ./bim treasury:deploy <testnet|mainnet>');
    process.exit(1);
  }
  return arg;
}

export async function run(args: string[]): Promise<void> {
  const network = parseNetwork(args);
  const secrets = loadSecrets();
  const treasury = requireTreasury(secrets, network);
  const provider = createProvider(network);

  console.log('Address:', treasury.address);

  // Check if already deployed
  try {
    await provider.getNonceForAddress(treasury.address);
    const balance = await getStrkBalance(provider, treasury.address);
    console.log(`Already deployed on ${network}.`);
    console.log(`Balance: ${formatStrk(balance)}`);
    console.log('Nothing to do.');
    return;
  } catch {
    // Not deployed yet — proceed
  }

  const balance = await getStrkBalance(provider, treasury.address);
  if (balance === 0n) {
    console.error('\nAccount has no STRK. Fund it first.');
    if (network === 'testnet') {
      console.error('  Faucet: https://starknet-faucet.vercel.app/');
    }
    console.error('  Address:', treasury.address);
    process.exit(1);
  }

  console.log(`Deploying treasury account on ${network}...`);
  console.log('STRK balance:', formatStrk(balance), '\n');

  const account = createAccount(provider, treasury);
  const constructorCallData = CallData.compile({publicKey: treasury.publicKey});

  const {transaction_hash, contract_address} = await account.deployAccount({
    classHash: treasury.classHash,
    constructorCalldata: constructorCallData,
    addressSalt: treasury.publicKey,
  });

  console.log('Transaction hash:', transaction_hash);
  console.log('Waiting for confirmation...');

  await provider.waitForTransaction(transaction_hash);

  console.log('\n=== Account Deployed ===');
  console.log('Address:', contract_address);
}
