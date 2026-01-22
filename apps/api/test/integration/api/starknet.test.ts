import type {Hono} from 'hono';
import pg from "pg";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {
  type DbClient,
  StrkDevnet, StrkDevnetContext,
  TestApp,
  TestDatabase
} from '../helpers';
import {AccountFixture} from "../helpers/account";
import {AuthFixture} from "../helpers/auth";

/**
 * Starknet Integration Tests
 *
 * These tests require the starknet-devnet container to be running.
 * They test the full flow of account deployment and Starknet interactions.
 *
 * -- WORK IN PROGRESS --
 */
describe('Starknet Integration', () => {
  if (!StrkDevnet.isAvailable()) {
    it.skip('devnet not available - skipping Starknet tests', () => {});
    return;
  }

  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;
  let strkContext: StrkDevnetContext;

  beforeAll(() => {
    strkContext = StrkDevnetContext.create();
    app = TestApp.createTestApp({
      context: {
        gateways: {
          starknet: strkContext.getStarknetGateway(),
          paymaster: strkContext.getDevnetPaymasterGateway(),
        }
      }
    });
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
  });

  afterAll(async () => {
    strkContext.resetStarknetContext();
    await pool.end();
  });

  describe('Starknet Gateway', () => {
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
      expect(deployTx.constructorCallData).toContain(publicKey);
    });
  });

  describe('Devnet Paymaster Gateway', () => {
    it('is available on devnet', async () => {
      const gateway = strkContext.getDevnetPaymasterGateway();
      const publicKey = strkContext.generateTestPublicKey();
      const starknetGateway = strkContext.getStarknetGateway();
      const address = await starknetGateway.calculateAccountAddress({publicKey});

      const available = await gateway.isAvailable(address);

      expect(available).toBe(true);
    });

    it('returns sponsored gas limit', async () => {
      const gateway = strkContext.getDevnetPaymasterGateway();

      const limit = await gateway.getSponsoredGasLimit();

      expect(limit).toBeGreaterThan(0n);
    });

    it('can fund an address with ETH', async () => {
      console.log("");
      const publicKey = strkContext.generateTestPublicKey();
      const starknetGateway = strkContext.getStarknetGateway();
      const address = await starknetGateway.calculateAccountAddress({publicKey});
      console.debug(`Starknet address: ${address}`);

      // Fund the address
      const fundAmount = '1000000000000000000'; // 1 ETH
      await strkContext.fundAddress(address, fundAmount);
      console.debug(`Address funded`);

      // Check balance
      const balance = await strkContext.getEthBalance(address);

      expect(balance).toBe(BigInt(fundAmount));
    });
  });

  describe('Account Deployment Flow', () => {
    // Note: Full WebAuthn account deployment requires actual device signing.
    // This test is skipped because:
    // 1. deployAccountContract requires a signature from the account's private key
    // 2. WebAuthn accounts have their private key on the user's device (not accessible in tests)
    // 3. To fully test deployment, use E2E tests with a browser and WebAuthn emulator
    it.skip('deploys an account via paymaster (gasless) - requires WebAuthn signing', async () => {
      // 1. Generate a test public key and calculate address
      const publicKey = strkContext.generateTestPublicKey();
      const starknetGateway = strkContext.getStarknetGateway();
      const starknetAddress = await starknetGateway.calculateAccountAddress({publicKey});

      // 2. Create the account in the database with pending status and computed address
      const account = await accountFixture.insertAccount({
        username: 'deploy_test_user',
        publicKey,
        starknetAddress: starknetAddress.toString(),
        status: 'pending',
      });

      // 3. Create a session for authentication
      const session = await authFixture.insertSession(account.id);

      // 4. Call deploy endpoint
      const response = await TestApp.request(app).post(
        '/api/account/deploy',
        {},
        {headers: {Cookie: `session=${session.id}`}}
      );

      // 5. Verify response
      expect(response.status).toBe(200);
      const body = await response.json() as {txHash: string; status: string};
      expect(body.txHash).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(body.status).toBe('deploying');

      // 6. Wait for deployment to complete (async confirmation)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 7. Check deployment status
      const statusResponse = await TestApp.request(app).get(
        '/api/account/deployment-status',
        {headers: {Cookie: `session=${session.id}`}}
      );

      expect(statusResponse.status).toBe(200);
      const statusBody = await statusResponse.json() as {status: string; isDeployed: boolean};
      expect(statusBody.status).toBe('deployed');
      expect(statusBody.isDeployed).toBe(true);

      // 8. Verify the account is actually deployed on devnet
      const isDeployed = await strkContext.isAccountDeployed(starknetAddress);
      expect(isDeployed).toBe(true);
    });

    it('fails to deploy already deployed account', async () => {
      // Create the account that's already deployed
      const publicKey = strkContext.generateTestPublicKey();
      const starknetGateway = strkContext.getStarknetGateway();
      const starknetAddress = await starknetGateway.calculateAccountAddress({publicKey});

      const account = await accountFixture.insertAccount({
        username: 'already_deployed_user',
        publicKey,
        starknetAddress: starknetAddress.toString(),
        status: 'deployed', // Already deployed
      });

      const session = await authFixture.insertSession(account.id);

      // Try to deploy again
      const response = await TestApp.request(app).post(
        '/api/account/deploy',
        {},
        {headers: {Cookie: `session=${session.id}`}}
      );

      expect(response.status).toBe(400);
      const body = await response.json() as {error: string};
      expect(body.error).toContain('pending');
    });

    it('fails to deploy account without starknet address', async () => {
      // Create the account without the starknet address
      const account = await accountFixture.insertAccount({
        username: 'no_address_user',
        publicKey: strkContext.generateTestPublicKey(),
        starknetAddress: null, // No address
        status: 'pending',
      });

      const session = await authFixture.insertSession(account.id);

      const response = await TestApp.request(app).post(
        '/api/account/deploy',
        {},
        {headers: {Cookie: `session=${session.id}`}}
      );

      expect(response.status).toBe(400);
    });

    it('requires authentication to deploy', async () => {
      const response = await TestApp.request(app).post('/api/account/deploy', {});

      expect(response.status).toBe(401);
    });
  });

  describe('Starknet Helpers', () => {
    it('gets current block number', async () => {
      const blockNumber = await strkContext.getCurrentBlock();

      expect(blockNumber).toBeGreaterThanOrEqual(0);
    });

    it('checks if account is deployed (false for new address)', async () => {
      const publicKey = strkContext.generateTestPublicKey();
      const starknetGateway = strkContext.getStarknetGateway();
      const address = await starknetGateway.calculateAccountAddress({publicKey});

      const isDeployed = await strkContext.isAccountDeployed(address);

      expect(isDeployed).toBe(false);
    });
  });
});
