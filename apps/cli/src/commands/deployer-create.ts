import {CallData, ec, hash, stark} from 'starknet';
import {OZ_ACCOUNT_CLASS_HASH, STARKNET_FAUCET_URL} from '../config/constants.js';
import {loadSecrets, saveSecrets} from '../config/secrets.js';

export async function run(_args: string[]): Promise<void> {
  const secrets = loadSecrets();

  if (secrets.deployer) {
    console.error('Deployer account already exists in .secrets.json.');
    console.error('Delete the "deployer" section to regenerate.');
    process.exit(1);
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

  saveSecrets({
    ...secrets,
    deployer: {privateKey, publicKey, address, classHash: OZ_ACCOUNT_CLASS_HASH},
  });

  console.log('=== Deployer Account Created ===\n');
  console.log('Address:  ', address);
  console.log('Public key:', publicKey);
  console.log('\n--- Next steps ---');
  console.log(`1. Go to ${STARKNET_FAUCET_URL}`);
  console.log('2. Paste the address above and request STRK');
  console.log('3. Run: ./bim deployer:deploy');
}
