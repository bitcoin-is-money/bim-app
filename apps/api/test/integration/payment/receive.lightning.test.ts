import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {AppInstance} from '../../../src/app';
import type {ApiErrorResponse} from '../../../src/errors';
import type {SwapMonitor} from '../../../src/monitoring/swap.monitor';
import type {LightningReceiveResponse, SwapStatusResponse} from '../../../src/routes';
import {AtomiqGatewayMock} from '../../unit/mocks/atomiq.gateway.mock';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

/**
 * Lightning Receive Swap Lifecycle — Integration Tests
 *
 * Tests the full Lightning → Starknet swap lifecycle through the HTTP API:
 * creation, status polling, payment detection, SwapMonitor auto-claim,
 * completion, expiration, and edge cases.
 *
 * Uses AtomiqGatewayMock to control swap status transitions without
 * requiring a real Lightning node or Atomiq SDK.
 */
describe('Lightning Receive Swap Lifecycle', () => {
  let appInstance: AppInstance;
  let monitor: SwapMonitor;
  let pool: pg.Pool;
  let db: DbClient;
  let atomiqMock: AtomiqGatewayMock;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;

  // Per-test state
  let sessionCookie: string;

  const STARKNET_ADDRESS = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeAll(async () => {
    atomiqMock = new AtomiqGatewayMock();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);

    appInstance = await TestApp.createTestAppWithSwapMonitor({
      context: {
        gateways: {atomiq: atomiqMock},
      },
    });
    monitor = appInstance.swapMonitor!;
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    atomiqMock.clearSwaps();

    // Insert a deployed account with a session for each test
    const account = await accountFixture.insertAccount({
      status: 'deployed',
      starknetAddress: STARKNET_ADDRESS,
    });
    const session = await authFixture.insertSession(account.id);
    sessionCookie = `session=${session.id}`;
  });

  afterAll(async () => {
    if (monitor) await monitor.stop();
    await pool.end();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function request() {
    return TestApp.request(appInstance.app);
  }

  async function createLightningSwap(amount = '100000'): Promise<LightningReceiveResponse> {
    const response = await request().post('/api/payment/receive', {
      network: 'lightning',
      amount,
    }, {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    return await response.json() as LightningReceiveResponse;
  }

  async function getSwapStatus(swapId: string): Promise<SwapStatusResponse> {
    const response = await request().get(`/api/swap/status/${swapId}`, {
      headers: {Cookie: sessionCookie},
    });
    expect(response.status).toBe(200);
    return await response.json() as SwapStatusResponse;
  }

  // ---------------------------------------------------------------------------
  // Swap Creation
  // ---------------------------------------------------------------------------

  describe('Swap Creation', () => {
    it('creates a Lightning swap with invoice', async () => {
      const body = await createLightningSwap('100000');

      expect(body.network).toBe('lightning');
      expect(body.swapId).toBeDefined();
      expect(body.invoice).toBeDefined();
      expect(body.amount.value).toBe(100000);
      expect(body.amount.currency).toBe('SAT');
      expect(body.expiresAt).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Status Polling
  // ---------------------------------------------------------------------------

  describe('Status Polling', () => {
    it('returns pending status after creation', async () => {
      const swap = await createLightningSwap();
      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('pending');
      expect(status.progress).toBe(0);
      expect(status.direction).toBe('lightning_to_starknet');
      expect(status.txHash).toBeUndefined();
    });

    it('returns paid status after payment detected', async () => {
      const swap = await createLightningSwap();

      // Simulate: Atomiq detects Lightning payment
      atomiqMock.setSwapStatus(swap.swapId, {isPaid: true, state: 1});

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('paid');
      expect(status.progress).toBe(33);
    });

    it('returns expired status when swap expires', async () => {
      const swap = await createLightningSwap();

      atomiqMock.setSwapStatus(swap.swapId, {isExpired: true, state: -1});

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('expired');
    });

    it('returns failed status on error', async () => {
      const swap = await createLightningSwap();

      atomiqMock.setSwapStatus(swap.swapId, {isFailed: true, state: -3, error: 'SDK error'});

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('failed');
    });
  });

  // ---------------------------------------------------------------------------
  // SwapMonitor Auto-Claim
  // ---------------------------------------------------------------------------

  describe('SwapMonitor Status Sync', () => {
    it('detects payment via monitor polling', async () => {
      const swap = await createLightningSwap();

      // Simulate: Atomiq detects Lightning payment
      atomiqMock.setSwapStatus(swap.swapId, {isPaid: true, state: 1});

      // Monitor iteration syncs status from Atomiq → marks as paid
      await monitor.runIteration();

      const status = await getSwapStatus(swap.swapId);
      expect(status.status).toBe('paid');
      expect(status.progress).toBe(33);
    });

    it('transitions to completed when LP claims cooperatively', async () => {
      const swap = await createLightningSwap();
      const claimTxHash = '0xabc123';

      // Phase 1: Atomiq detects Lightning payment → paid
      atomiqMock.setSwapStatus(swap.swapId, {isPaid: true, state: 1});
      await monitor.runIteration();

      // Phase 2: LP/watchtower claims on Starknet → completed
      atomiqMock.setSwapStatus(swap.swapId, {isCompleted: true, state: 3, txHash: claimTxHash});
      await monitor.runIteration();

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
      expect(status.txHash).toBe(claimTxHash);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('returns swap not found for unknown swapId', async () => {
      const response = await request().get('/api/swap/status/unknown-swap-id', {
        headers: {Cookie: sessionCookie},
      });

      expect(response.status).toBe(404);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBeDefined();
    });

    it('does not change terminal status on subsequent polls', async () => {
      const swap = await createLightningSwap();

      // Mark as expired
      atomiqMock.setSwapStatus(swap.swapId, {isExpired: true, state: -1});
      const status1 = await getSwapStatus(swap.swapId);
      expect(status1.status).toBe('expired');

      // Change mock to paid — should NOT change because expired is terminal
      atomiqMock.setSwapStatus(swap.swapId, {isPaid: true, state: 1});
      const status2 = await getSwapStatus(swap.swapId);
      expect(status2.status).toBe('expired');
    });
  });
});
