import {serializeError} from '@bim/lib/error';
import {RpcProvider} from 'starknet';
import {BIM_CLASS_HASH, RPC_URLS} from '../config/constants.js';

async function checkNetwork(
  label: string,
  rpcUrl: string,
  classHash: string,
): Promise<boolean> {
  console.log(`[${label}] Checking class hash: ${classHash}`);
  try {
    const provider = new RpcProvider({nodeUrl: rpcUrl});
    await provider.getClass(classHash);
    console.log(`[${label}] OK - Declared`);
    return true;
  } catch (err: unknown) {
    const message = serializeError(err);
    if (message.includes('not found') || message.includes('CLASS_HASH_NOT_FOUND')) {
      console.log(`[${label}] NOT FOUND - Class hash is not declared`);
    } else {
      console.log(`[${label}] ERROR - ${message}`);
    }
    return false;
  }
}

export async function run(_args: string[]): Promise<void> {
  console.log('=== BIM Argent 0.5.0 — Class Hash Declaration Check ===\n');

  const sepoliaOk = await checkNetwork('sepolia', RPC_URLS.testnet, BIM_CLASS_HASH);
  console.log();
  const mainnetOk = await checkNetwork('mainnet', RPC_URLS.mainnet, BIM_CLASS_HASH);

  if (!sepoliaOk || !mainnetOk) {
    process.exit(1);
  }
}
