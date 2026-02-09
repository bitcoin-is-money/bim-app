import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {DeployAccountResponse} from '../../../src/routes/account/account.types';
import type {StarknetReceiveResponse} from '../../../src/routes/payment/receive/receive.types';
import {registerUser} from '../../helpers';
import {TestDatabase, TestnetApp, TestnetContext} from '../helpers';

/**
 * Receive Flow — Testnet (Starknet Sepolia)
 *
 * Tests the receive payment flow through the HTTP API.
 * For Starknet network: generates a starknet: URI (no Atomiq dependency).
 * Requires a deployed account (full registration + deployment on Sepolia).
 */
describe('Receive Flow (Testnet)', () => {
  let app: Hono;
  let pool: pg.Pool;
  let authenticator: WebauthnVirtualAuthenticator;
  let testnetContext: TestnetContext;

  // Shared state for the deployed account (deployed once for all tests)
  let deployedSessionCookie: string;
  let deployedStarknetAddress: string;

  // Set to true if deployment fails (skips tests that require a deployed account)
  let deploymentFailed = false;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    authenticator = new WebauthnVirtualAuthenticator();
    testnetContext = new TestnetContext();
    app = TestnetApp.createTestApp();

    // Register and deploy an account once for all receive tests
    // (deployment on Sepolia is slow, so we do it once)
    try {
      const {sessionCookie, starknetAddress} = await registerAndDeployUser('tn_recv_user');
      deployedSessionCookie = sessionCookie;
      deployedStarknetAddress = starknetAddress;
    } catch (error) {
      console.warn('Deployment failed, receive tests will be skipped:', error);
      deploymentFailed = true;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  function register(username: string) {
    return registerUser(TestnetApp.request(app), authenticator, username);
  }

  /**
   * Registers and deploys an account on Sepolia.
   * Waits for on-chain confirmation before returning.
   */
  async function registerAndDeployUser(username: string): Promise<{
    sessionCookie: string;
    starknetAddress: string;
  }> {
    const {sessionCookie} = await register(username);

    // Deploy
    const deployResponse = await TestnetApp
      .request(app)
      .post('/api/account/deploy', {}, {headers: {Cookie: sessionCookie}});

    if (deployResponse.status !== 200) {
      const errorBody = await deployResponse.text();
      throw new Error(`Deployment failed (HTTP ${deployResponse.status}): ${errorBody}`);
    }

    const deployBody = await deployResponse.json() as DeployAccountResponse;

    // Wait for Sepolia confirmation
    await testnetContext.waitForTransaction(deployBody.txHash);
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {sessionCookie, starknetAddress: deployBody.starknetAddress};
  }

  describe('POST /api/payment/receive (starknet)', () => {
    it('returns starknet URI with amount and token', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'starknet',
          amount: '1000',
        }, {headers: {Cookie: deployedSessionCookie}});

      expect(response.status).toBe(200);
      const body = await response.json() as StarknetReceiveResponse;

      expect(body.network).toBe('starknet');
      expect(body.address).toBe(deployedStarknetAddress);
      expect(body.uri).toContain(`starknet:${deployedStarknetAddress}`);
      expect(body.uri).toContain('amount=1000');
      expect(body.uri).toContain('token=');
    });

    it('rejects receive for non-deployed account', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');
      // Register a new user (not deployed)
      const {sessionCookie: pendingCookie} = await register('tn_recv_pending');

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'starknet',
          amount: '1000',
        }, {headers: {Cookie: pendingCookie}});

      expect(response.status).toBe(400);
    });

    it('rejects unauthenticated receive request', async () => {
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'starknet',
          amount: '1000',
        });

      expect(response.status).toBe(401);
    });
  });
});
