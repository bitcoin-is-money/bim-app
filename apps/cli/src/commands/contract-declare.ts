import {RpcProvider} from 'starknet';
import {BIM_CLASS_HASH, COMPILED_CLASS_HASH, RPC_URLS} from '../config/constants.js';
import {loadSecrets, requireDeployer} from '../config/secrets.js';
import {createAccount} from '../lib/starknet.js';

export async function run(_args: string[]): Promise<void> {
  const secrets = loadSecrets();
  const deployer = requireDeployer(secrets);

  const sepoliaProvider = new RpcProvider({nodeUrl: RPC_URLS.testnet});
  const mainnetProvider = new RpcProvider({nodeUrl: RPC_URLS.mainnet});

  // Check if already declared on Sepolia (idempotent)
  try {
    await sepoliaProvider.getClass(BIM_CLASS_HASH);
    console.log('Contract is already declared on Sepolia. Nothing to do.');
    console.log('Class hash:', BIM_CLASS_HASH);
    return;
  } catch {
    // Not declared yet — proceed
  }

  // Fetch Sierra from Mainnet
  console.log('Fetching Sierra from Mainnet...');
  const sierra = await mainnetProvider.getClass(BIM_CLASS_HASH);
  if ('contract_class_version' in sierra) {
    console.log('Sierra fetched (version:', sierra.contract_class_version, ')\n');
  }

  // Declare on Sepolia
  const account = createAccount(sepoliaProvider, deployer);

  console.log('Declaring contract on Sepolia...');
  const {transaction_hash, class_hash} = await account.declare({
    contract: sierra as Parameters<typeof account.declare>[0]['contract'],
    compiledClassHash: COMPILED_CLASS_HASH,
  });

  console.log('Transaction hash:', transaction_hash);
  console.log('Waiting for confirmation...');

  await sepoliaProvider.waitForTransaction(transaction_hash);

  console.log('\n=== Contract Declared on Sepolia ===');
  console.log('Class hash:', class_hash);
}
