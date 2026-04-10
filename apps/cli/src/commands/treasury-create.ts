import {CallData, ec, hash, stark} from 'starknet';
import {type Network, OZ_ACCOUNT_CLASS_HASH, STARKNET_FAUCET_URL} from '../config/constants.js';
import {loadSecrets, saveSecrets} from '../config/secrets.js';
import {formatStrk} from "../lib/format";
import {createProvider, getStrkBalance} from '../lib/starknet.js';

function parseNetwork(args: string[]): Network {
  const arg = args[0];
  if (arg !== 'testnet' && arg !== 'mainnet') {
    console.error('Usage: ./bim treasury:create <testnet|mainnet>');
    process.exit(1);
  }
  return arg;
}

export async function run(args: string[]): Promise<void> {
  const network = parseNetwork(args);
  const secrets = loadSecrets();
  const existing = network === 'mainnet' ? secrets.treasury?.mainnet : secrets.treasury?.testnet;

  if (existing) {
    // Check if already deployed on-chain (has nonce > 0 or has balance)
    const provider = createProvider(network);
    const balance = await getStrkBalance(provider, existing.address);
    const isDeployed = balance > 0n;

    if (isDeployed) {
      console.log(`Treasury account already exists and is funded on ${network}.`);
      console.log(`Address: ${existing.address}`);
      console.log(`Balance: ${formatStrk(balance)}`);
      console.log('Nothing to do.');
      return;
    }

    console.log(`Treasury account exists for ${network} but is not funded yet.`);
    console.log(`Address: ${existing.address}`);
    console.log('\n--- Next steps ---');
    if (network === 'testnet') {
      console.log(` - Go to ${STARKNET_FAUCET_URL}`);
      console.log(' - Paste the address above and request STRK');
    } else {
      console.log(' - Transfer STRK to the address above');
    }
    console.log(` - Run: ./bim treasury:deploy ${network}`);
    return;
  }

  const privateKey = stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  const constructorCallData = CallData.compile({publicKey});
  const address = hash.calculateContractAddressFromHash(
    publicKey,
    OZ_ACCOUNT_CLASS_HASH,
    constructorCallData,
    0,
  );

  const updated = {
    ...secrets,
    treasury: {
      ...secrets.treasury,
      [network]: {privateKey, publicKey, address, classHash: OZ_ACCOUNT_CLASS_HASH},
    },
  };
  saveSecrets(updated);

  console.log(`=== Treasury Account Created (${network}) ===\n`);
  console.log('Address:  ', address);
  console.log('Public key:', publicKey);
  console.log('\n--- Next steps ---');
  if (network === 'testnet') {
    console.log(`1. Go to ${STARKNET_FAUCET_URL}`);
    console.log('2. Paste the address above and request STRK');
  } else {
    console.log('1. Transfer STRK to the address above');
  }
  console.log(`3. Run: ./bim treasury:deploy ${network}`);
}
