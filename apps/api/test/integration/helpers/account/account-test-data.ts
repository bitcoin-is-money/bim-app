import * as schema from '@bim/db';

export function createAccountData(
  overrides?: Partial<schema.NewAccountRecord>
): schema.NewAccountRecord {
  const id = crypto.randomUUID();
  return {
    id,
    username: `testUser_${id.slice(0, 8)}`,
    credentialId: `cred_${id}`,
    publicKey: `pubkey_${id}`,
    credentialPublicKey: null,
    starknetAddress: null,
    status: 'pending',
    deploymentTxHash: null,
    signCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
