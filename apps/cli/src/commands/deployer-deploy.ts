import {CallData} from 'starknet';
import {loadSecrets, requireDeployer} from '../config/secrets.js';
import {formatStrk} from '../lib/format.js';
import {createAccount, createProvider, getStrkBalance} from '../lib/starknet.js';

export async function run(_args: string[]): Promise<void> {
  const secrets = loadSecrets();
  const deployer = requireDeployer(secrets);
  const provider = createProvider('testnet');

  console.log('Checking STRK balance for', deployer.address, '...');
  const balance = await getStrkBalance(provider, deployer.address);

  if (balance === 0n) {
    console.error('\nAccount has no STRK. Fund it first via the faucet:');
    console.error('  https://starknet-faucet.vercel.app/');
    console.error('  Address:', deployer.address);
    process.exit(1);
  }
  console.log('STRK balance:', formatStrk(balance), '\n');

  console.log('Deploying account...');
  const account = createAccount(provider, deployer);
  const constructorCallData = CallData.compile({publicKey: deployer.publicKey});

  const {transaction_hash, contract_address} = await account.deployAccount({
    classHash: deployer.classHash,
    constructorCalldata: constructorCallData,
    addressSalt: deployer.publicKey,
  });

  console.log('Transaction hash:', transaction_hash);
  console.log('Waiting for confirmation...');

  await provider.waitForTransaction(transaction_hash);

  console.log('\n=== Account Deployed ===');
  console.log('Address:', contract_address);
  console.log('\nNext: ./bim contract:declare');
}
