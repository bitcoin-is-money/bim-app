import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {StrkDevnetContext} from '../helpers';

describe('StarknetRpcGateway', () => {
  let strkContext: StrkDevnetContext;

  beforeAll(() => {
    strkContext = StrkDevnetContext.create();
  });

  afterAll(() => {
    strkContext.resetStarknetContext();
  });

  it('calculates account address from public key', async () => {
    const publicKey = strkContext.generateTestPublicKey();
    const gateway = strkContext.getStarknetGateway();

    const address = await gateway.calculateAccountAddress({publicKey});

    expect(address).toBeDefined();
    expect(address.toString()).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('builds deploy transaction', async () => {
    const publicKey = strkContext.generateTestPublicKey();
    const gateway = strkContext.getStarknetGateway();

    const address = await gateway.calculateAccountAddress({publicKey});
    const deployTx = await gateway.buildDeployTransaction({
      starknetAddress: address,
      publicKey,
    });

    expect(deployTx.type).toBe('DEPLOY_ACCOUNT');
    expect(deployTx.classHash).toBe(strkContext.getAccountClassHash());
    // Calldata is Argent Signer::Webauthn struct: [0x4, origin_len, ...bytes, rpIdHash_low, rpIdHash_high, pubkey_low, pubkey_high, 0x1]
    expect(deployTx.constructorCallData[0]).toBe('0x4'); // Webauthn variant
    expect(deployTx.constructorCallData[deployTx.constructorCallData.length - 1]).toBe('0x1'); // Option::None guardian
    expect(deployTx.constructorCallData.length).toBeGreaterThan(7); // At minimum: variant + len + rpId(2) + pubkey(2) + guardian
    expect(deployTx.salt).toBe('0xc'); // Constant salt = 12n
  });
});
