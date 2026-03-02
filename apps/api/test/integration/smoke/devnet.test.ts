import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {StrkDevnetContext} from '../helpers';

/**
 * Devnet Smoke Tests
 *
 * Validates basic connectivity and operations against the Starknet devnet container.
 * These tests ensure the devnet infrastructure is working before running heavier tests.
 */
describe('Devnet Smoke', () => {
  let strkContext: StrkDevnetContext;

  beforeAll(() => {
    strkContext = StrkDevnetContext.create();
  });

  afterAll(() => {
    strkContext.resetStarknetContext();
  });

  it('gets current block number', async () => {
    const blockNumber = await strkContext.getCurrentBlock();

    expect(blockNumber).toBeGreaterThanOrEqual(0);
  });

  it('checks that a new address is not deployed', async () => {
    const publicKey = strkContext.generateTestPublicKey();
    const gateway = strkContext.getStarknetGateway();
    const address = gateway.calculateAccountAddress({publicKey});

    const isDeployed = await strkContext.isAccountDeployed(address);

    expect(isDeployed).toBe(false);
  });

  it('funds an address with ETH', async () => {
    const publicKey = strkContext.generateTestPublicKey();
    const gateway = strkContext.getStarknetGateway();
    const address = gateway.calculateAccountAddress({publicKey});

    const fundAmount = '1000000000000000000'; // 1 ETH
    await strkContext.fundAddress(address, fundAmount);

    const balance = await strkContext.getEthBalance(address);
    expect(balance).toBe(BigInt(fundAmount));
  });

  it('devnet paymaster is available', async () => {
    const publicKey = strkContext.generateTestPublicKey();
    const gateway = strkContext.getStarknetGateway();
    const address = gateway.calculateAccountAddress({publicKey});
    const paymaster = strkContext.getDevnetPaymasterGateway();

    const available = await paymaster.isAvailable(address);

    expect(available).toBe(true);
  });
});
