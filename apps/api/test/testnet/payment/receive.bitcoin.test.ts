import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {ApiErrorResponse} from '../../../src/errors';
import type {BitcoinReceivePendingCommitResponse} from '../../../src/routes';
import {registerAndDeployUser, registerUser} from '../../helpers';
import {TestDatabase, TestnetApp, TestnetContext} from '../helpers';

/**
 * Receive Flow — Bitcoin (Testnet)
 *
 * These tests use the REAL Atomiq SDK connected to Starknet Sepolia.
 * They validate that swap creation (phase 1) works end-to-end:
 * the SDK creates a swap quote and returns commit transactions.
 *
 * Phase 1 (POST /receive): Returns pending_commit with commit data for WebAuthn signing.
 * Phase 2 (POST /receive/commit): Not tested here — requires signing the commit
 * transaction, submitting it on-chain, and waiting for the SDK to detect the commit.
 * Phase 2 is covered in integration tests with AtomiqGatewayMock.
 *
 * Full swap lifecycle (status polling, claim, completion) is also covered in:
 * test/integration/payment/receive.bitcoin.test.ts
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
    app = await TestnetApp.createTestApp();

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

  describe('POST /api/payment/receive (bitcoin) — Phase 1', () => {
    it('returns pending_commit response with commit data for signing', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: '100000', // 100k sats
        }, {headers: {Cookie: deployedSessionCookie}});

      expect(response.status).toBe(200);
      const body = await response.json() as BitcoinReceivePendingCommitResponse;

      expect(body.network).toBe('bitcoin');
      expect(body.status).toBe('pending_commit');
      expect(body.swapId).toBeDefined();
      expect(body.buildId).toBeDefined();
      expect(body.messageHash).toBeDefined();
      expect(body.credentialId).toBeDefined();
      expect(body.amount.value).toBe(100000);
      expect(body.amount.currency).toBe('SAT');
      expect(body.expiresAt).toBeDefined();

      // Verify expiration is in the future (approximately 3 hours)
      const expiresAt = new Date(body.expiresAt);
      const now = new Date();
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now.getTime() + 4 * 60 * 60 * 1000);
    });

    it('returns pending_commit for minimum amount (50k sats)', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: '50000', // minimum: 50k sats
        }, {headers: {Cookie: deployedSessionCookie}});

      expect(response.status).toBe(200);
      const body = await response.json() as BitcoinReceivePendingCommitResponse;

      expect(body.network).toBe('bitcoin');
      expect(body.status).toBe('pending_commit');
      expect(body.amount.value).toBe(50000);
      expect(body.buildId).toBeDefined();
      expect(body.messageHash).toBeDefined();
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
