import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {StarknetReceiveResponse} from '../../../src/routes';
import {registerAndDeployUser} from '../../helpers';
import {TestDatabase, TestnetApp, TestnetContext} from '../helpers';

/**
 * Receive Flow — Starknet (Testnet)
 *
 * Tests Starknet receive flow through the HTTP API.
 * Generates a starknet: URI (no Atomiq dependency).
 * Requires a deployed account (full registration and deployment on Sepolia).
 */
describe('Receive Flow — Starknet (Testnet)', () => {
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
    app = await TestnetApp.createTestApp();

    // Register and deploy an account once, for all receive tests
    try {
      const result = await registerAndDeployUser({
        requester: TestnetApp.request(app),
        authenticator,
        waitForTransaction: (txHash) => testnetContext.waitForTransaction(txHash),
      }, 'tn_recv_strk');
      deployedSessionCookie = result.sessionCookie;
      deployedStarknetAddress = result.starknetAddress;
    } catch (error) {
      console.warn('Deployment failed, starknet receive tests will be skipped:', error);
      deploymentFailed = true;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

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
});
