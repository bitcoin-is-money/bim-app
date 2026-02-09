import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {ApiErrorResponse} from '../../../src/errors';
import type {BitcoinReceiveResponse} from '../../../src/routes';
import {registerAndDeployUser, registerUser} from '../../helpers';
import {TestDatabase, TestnetApp, TestnetContext} from '../helpers';

/**
 * Receive Flow — Bitcoin (Testnet)
 *
 * These tests use the REAL Atomiq SDK connected to Starknet Sepolia.
 * They validate that swap creation works end-to-end with the actual SDK,
 * including deposit address generation and BIP-21 URI formatting.
 *
 * IMPORTANT: Swap lifecycle testing (status transitions: paid, claim, completed)
 * is NOT possible in these testnet tests because:
 * - It would require sending real BTC on Bitcoin testnet, which is slow
 *   (~10 mins block confirmations) and depends on unreliable faucets.
 * - The Atomiq SDK does not support Bitcoin regtest (a fully local Bitcoin
 *   blockchain where you control block mining and can send transactions instantly).
 *
 * The full swap lifecycle (pending → paid → confirming → completed, plus edge
 * cases like expired+paid and SwapMonitor auto-claim) is covered in the
 * integration tests at: test/integration/payment/receive.bitcoin.test.ts
 * using AtomiqGatewayMock for controllable status transitions.
 */
describe('Receive Flow — Bitcoin (Testnet)', () => {
  let app: Hono;
  let pool: pg.Pool;
  let authenticator: WebauthnVirtualAuthenticator;
  let testnetContext: TestnetContext;

  // Shared state for the deployed account (deployed once for all tests)
  let deployedSessionCookie: string;

  // Set to true if deployment fails (skips tests that require a deployed account)
  let deploymentFailed = false;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    authenticator = new WebauthnVirtualAuthenticator();
    testnetContext = new TestnetContext();
    app = TestnetApp.createTestApp();

    // Register and deploy an account once, for all Bitcoin receive tests
    try {
      const result = await registerAndDeployUser({
        requester: TestnetApp.request(app),
        authenticator,
        waitForTransaction: (txHash) => testnetContext.waitForTransaction(txHash),
      }, 'tn_recv_btc');
      deployedSessionCookie = result.sessionCookie;
    } catch (error) {
      console.warn('Deployment failed, bitcoin receive tests will be skipped:', error);
      deploymentFailed = true;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/payment/receive (bitcoin)', () => {
    it('creates a Bitcoin swap with deposit address and BIP-21 URI', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: '100000', // 100k sats
        }, {headers: {Cookie: deployedSessionCookie}});

      expect(response.status).toBe(200);
      const body = await response.json() as BitcoinReceiveResponse;

      expect(body.network).toBe('bitcoin');
      expect(body.swapId).toBeDefined();
      expect(body.depositAddress).toBeDefined();
      expect(body.bip21Uri).toContain('bitcoin:');
      expect(body.bip21Uri).toContain(body.depositAddress);
      expect(body.amount.value).toBe(100000);
      expect(body.amount.currency).toBe('SAT');
      expect(body.expiresAt).toBeDefined();

      // Verify expiration is in the future (approximately 3 hours)
      const expiresAt = new Date(body.expiresAt);
      const now = new Date();
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now.getTime() + 4 * 60 * 60 * 1000);
    });

    it('creates a Bitcoin swap with minimum amount (50k sats)', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: '50000', // minimum: 50k sats
        }, {headers: {Cookie: deployedSessionCookie}});

      expect(response.status).toBe(200);
      const body = await response.json() as BitcoinReceiveResponse;

      expect(body.network).toBe('bitcoin');
      expect(body.amount.value).toBe(50000);
      expect(body.depositAddress).toBeDefined();
      expect(body.bip21Uri).toContain('bitcoin:');
    });

    it('rejects Bitcoin receive without amount', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
        }, {headers: {Cookie: deployedSessionCookie}});

      expect(response.status).toBe(400);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBeDefined();
    });

    it('rejects Bitcoin receive with amount below minimum', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: '1000', // 1k sats — below 50k minimum
        }, {headers: {Cookie: deployedSessionCookie}});

      expect(response.status).toBe(400);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBeDefined();
    });

    it('rejects Bitcoin receive for non-deployed account', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      const {sessionCookie: pendingCookie} = await registerUser(
        TestnetApp.request(app), authenticator, 'tn_recv_btc_pending',
      );

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: '100000',
        }, {headers: {Cookie: pendingCookie}});

      expect(response.status).toBe(400);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('ACCOUNT_NOT_DEPLOYED');
    });
  });
});
