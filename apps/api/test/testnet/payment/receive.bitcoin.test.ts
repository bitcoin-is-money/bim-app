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
 *
 * NOTE: Swap amounts are fetched dynamically from the LP limits endpoint
 * because testnet LP limits change over time. The happy-path tests may be
 * skipped when external services (AVNU DEX, Atomiq LP) are unavailable.
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

  // Dynamic limits from the LP (fetched in beforeAll)
  let minSats: number;
  let maxSats: number;

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

    // Fetch current LP limits so tests use valid amounts.
    // The limits endpoint requires auth, so we use the deployed session.
    if (!deploymentFailed) {
      const limitsRes = await TestnetApp.request(app).get('/api/swap/limits/bitcoin_to_starknet', {
        headers: {Cookie: deployedSessionCookie},
      });
      if (limitsRes.status === 200) {
        const limits = await limitsRes.json() as {minSats: string; maxSats: string};
        minSats = Number(limits.minSats);
        maxSats = Number(limits.maxSats);
      }
    }
    // Fallback: conservative defaults
    minSats ??= 1000;
    maxSats ??= 25000;
  });

  afterAll(async () => {
    await pool.end();
  });

  /**
   * Helper: skip test on external service errors (502).
   * Bitcoin receive depends on Atomiq LP + AVNU DEX which may be unavailable on testnet.
   */
  function skipOnExternalServiceError(response: Response, skip: (reason: string) => void): void {
    if (response.status === 502) {
      skip('External service unavailable (Atomiq LP or AVNU DEX)');
    }
  }

  describe('POST /api/payment/receive (bitcoin) — Phase 1', () => {
    it('returns pending_commit response with commit data for signing', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      // Use a conservative amount close to minSats — LP real limits may be
      // much lower than what SDK getSwapLimits() reports.
      const amount = minSats + 500;
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: String(amount),
        }, {headers: {Cookie: deployedSessionCookie}});

      skipOnExternalServiceError(response, skip);
      expect(response.status).toBe(200);
      const body = await response.json() as BitcoinReceivePendingCommitResponse;

      expect(body.network).toBe('bitcoin');
      expect(body.status).toBe('pending_commit');
      expect(body.swapId).toBeDefined();
      expect(body.buildId).toBeDefined();
      expect(body.messageHash).toBeDefined();
      expect(body.credentialId).toBeDefined();
      expect(body.amount.value).toBe(amount);
      expect(body.amount.currency).toBe('SAT');
      expect(body.expiresAt).toBeDefined();

      // Verify expiration is in the future (approximately 3 hours)
      const expiresAt = new Date(body.expiresAt);
      const now = new Date();
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now.getTime() + 4 * 60 * 60 * 1000);
    });

    it('returns pending_commit for near-minimum amount', async ({skip}) => {
      if (deploymentFailed) skip('Deployment failed — AVNU paymaster likely needs updating');

      // Use minSats + small margin to avoid edge cases at exact boundary
      const nearMin = minSats + 10;
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: String(nearMin),
        }, {headers: {Cookie: deployedSessionCookie}});

      skipOnExternalServiceError(response, skip);
      expect(response.status).toBe(200);
      const body = await response.json() as BitcoinReceivePendingCommitResponse;

      expect(body.network).toBe('bitcoin');
      expect(body.status).toBe('pending_commit');
      expect(body.amount.value).toBe(nearMin);
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

      const belowMin = Math.max(1, minSats - 1);
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/receive', {
          network: 'bitcoin',
          amount: String(belowMin),
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
          amount: String(minSats),
        }, {headers: {Cookie: pendingCookie}});

      expect(response.status).toBe(400);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('ACCOUNT_NOT_DEPLOYED');
    });
  });
});
