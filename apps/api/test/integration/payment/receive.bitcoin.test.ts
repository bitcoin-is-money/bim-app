import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {AppInstance} from '../../../src/app';
import type {ApiErrorResponse} from '../../../src/errors';
import type {SwapMonitor} from '../../../src/monitoring/swap.monitor';
import type {BitcoinReceivePendingCommitResponse, SwapStatusResponse} from '../../../src/routes';
import {AtomiqGatewayMock} from '../../unit/mocks/atomiq.gateway.mock';
import {StarknetGatewayMock} from '../../unit/mocks/starknet.gateway.mock';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

/**
 * Bitcoin Receive Swap Lifecycle — Integration Tests
 *
 * Tests the full Bitcoin → Starknet swap lifecycle through the HTTP API:
 * creation (phase 1 — pending_commit), status polling, payment detection,
 * SwapMonitor auto-claim, completion, expiration, and edge cases.
 *
 * Phase 2 (commit with WebAuthn) is not tested here because it requires
 * browser WebAuthn APIs. The commit flow is tested at the unit level.
 *
 * Uses AtomiqGatewayMock and StarknetGatewayMock to control swap behavior
 * without requiring real networks or SDK.
 */
describe('Bitcoin Receive Swap Lifecycle', () => {
  let appInstance: AppInstance;
  let monitor: SwapMonitor;
  let pool: pg.Pool;
  let db: DbClient;
  let atomiqMock: AtomiqGatewayMock;
  let starknetMock: StarknetGatewayMock;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;

  // Per-test state
  let sessionCookie: string;
  let accountId: string;

  const STARKNET_ADDRESS = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeAll(async () => {
    atomiqMock = new AtomiqGatewayMock();
    starknetMock = new StarknetGatewayMock();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);

    appInstance = await TestApp.createTestAppWithSwapMonitor({
      context: {
        gateways: {atomiq: atomiqMock, starknet: starknetMock},
      },
    });
    monitor = appInstance.monitor!;
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    atomiqMock.clearSwaps();

    // Insert a deployed account with a session for each test
    const account = await accountFixture.insertAccount({
      status: 'deployed',
      starknetAddress: STARKNET_ADDRESS,
    });
    accountId = account.id;
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

  /**
   * Phase 1: POST /receive for bitcoin — returns pending_commit with commit data.
   */
  async function createBitcoinPendingCommit(amount = '100000'): Promise<BitcoinReceivePendingCommitResponse> {
    const response = await request().post('/api/payment/receive', {
      network: 'bitcoin',
      amount,
    }, {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    return await response.json() as BitcoinReceivePendingCommitResponse;
  }

  /**
   * Inserts a fully-committed Bitcoin swap directly into the DB.
   * Used for lifecycle tests (status polling, auto-claim, edge cases)
   * that don't need to test the two-phase creation flow.
   */
  async function insertBitcoinSwap(swapId: string, amount = '100000'): Promise<{swapId: string; depositAddress: string}> {
    const depositAddress = `tb1q${swapId.replaceAll('-', '')}`.slice(0, 42);

    // Register in atomiq mock for status checks
    atomiqMock.setSwapStatus(swapId, {state: 0, isPaid: false, isCompleted: false, isFailed: false, isExpired: false});

    // Insert directly into DB
    await pool.query(
      `INSERT INTO bim_swaps (id, direction, amount_sats, destination_address, deposit_address, description, account_id, status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [swapId, 'bitcoin_to_starknet', amount, STARKNET_ADDRESS.toLowerCase(), depositAddress, 'Received', accountId, 'pending', new Date(Date.now() + 3 * 60 * 60 * 1000)],
    );

    return {swapId, depositAddress};
  }

  async function getSwapStatus(swapId: string): Promise<SwapStatusResponse> {
    const response = await request().get(`/api/swap/status/${swapId}`, {
      headers: {Cookie: sessionCookie},
    });
    expect(response.status).toBe(200);
    return await response.json() as SwapStatusResponse;
  }

  // ---------------------------------------------------------------------------
  // Swap Creation — Phase 1 (pending_commit)
  // ---------------------------------------------------------------------------

  describe('Swap Creation (Phase 1)', () => {
    it('returns pending_commit response with commit data for WebAuthn signing', async () => {
      const body = await createBitcoinPendingCommit();

      expect(body.network).toBe('bitcoin');
      expect(body.status).toBe('pending_commit');
      expect(body.swapId).toBeDefined();
      expect(body.buildId).toBeDefined();
      expect(body.messageHash).toBeDefined();
      expect(body.credentialId).toBeDefined();
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
      const {swapId} = await insertBitcoinSwap('btc-swap-001');
      const status = await getSwapStatus(swapId);

      expect(status.status).toBe('pending');
      expect(status.progress).toBe(0);
      expect(status.direction).toBe('bitcoin_to_starknet');
      expect(status.txHash).toBeUndefined();
    });

    it('returns paid status after payment detected', async () => {
      const {swapId} = await insertBitcoinSwap('btc-swap-002');

      // Simulate: Atomiq detects BTC deposit
      atomiqMock.setSwapStatus(swapId, {isPaid: true, state: 1});

      const status = await getSwapStatus(swapId);

      expect(status.status).toBe('paid');
      expect(status.progress).toBe(33);
    });

    it('returns expired status when swap expires', async () => {
      const {swapId} = await insertBitcoinSwap('btc-swap-003');

      atomiqMock.setSwapStatus(swapId, {isExpired: true, state: -1});

      const status = await getSwapStatus(swapId);

      expect(status.status).toBe('expired');
    });

    it('returns failed status on error', async () => {
      const {swapId} = await insertBitcoinSwap('btc-swap-004');

      atomiqMock.setSwapStatus(swapId, {isFailed: true, state: -3, error: 'SDK error'});

      const status = await getSwapStatus(swapId);

      expect(status.status).toBe('failed');
    });
  });

  // ---------------------------------------------------------------------------
  // SwapMonitor Auto-Claim
  // ---------------------------------------------------------------------------

  describe('SwapMonitor Status Sync', () => {
    it('detects payment via monitor polling', async () => {
      const {swapId} = await insertBitcoinSwap('btc-swap-010');

      // Simulate: Atomiq detects BTC deposit
      atomiqMock.setSwapStatus(swapId, {isPaid: true, state: 1});

      // Monitor iteration syncs status from Atomiq → marks as paid
      await monitor.runIteration();

      const status = await getSwapStatus(swapId);
      expect(status.status).toBe('paid');
      expect(status.progress).toBe(33);
    });

    it('transitions to completed when LP claims cooperatively', async () => {
      const {swapId} = await insertBitcoinSwap('btc-swap-011');
      const claimTxHash = '0xabc123';

      // Phase 1: Atomiq detects BTC deposit → paid
      atomiqMock.setSwapStatus(swapId, {isPaid: true, state: 1});
      await monitor.runIteration();

      // Phase 2: LP/watchtower claims on Starknet → completed
      atomiqMock.setSwapStatus(swapId, {isCompleted: true, state: 3, txHash: claimTxHash});
      await monitor.runIteration();

      const status = await getSwapStatus(swapId);

      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
      expect(status.txHash).toBe(claimTxHash);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('keeps Bitcoin swap as paid when expired + paid (BTC is irreversible)', async () => {
      const {swapId} = await insertBitcoinSwap('btc-swap-020');

      // Edge case: Atomiq reports expired, but deposit was already confirmed
      atomiqMock.setSwapStatus(swapId, {isExpired: true, isPaid: true, state: -1});

      const status = await getSwapStatus(swapId);

      // Should be 'paid', NOT 'expired' — Bitcoin transactions are irreversible
      expect(status.status).toBe('paid');
    });

    it('returns swap not found for unknown swapId', async () => {
      const response = await request().get('/api/swap/status/unknown-swap-id', {
        headers: {Cookie: sessionCookie},
      });

      expect(response.status).toBe(404);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBeDefined();
    });

    it('does not change terminal status on subsequent polls', async () => {
      const {swapId} = await insertBitcoinSwap('btc-swap-022');

      // Mark as expired, then refunded (security deposit returned)
      atomiqMock.setSwapStatus(swapId, {isExpired: true, state: -1});
      const status1 = await getSwapStatus(swapId);
      expect(status1.status).toBe('expired');

      // Atomiq refunds → status transitions to refunded
      atomiqMock.setSwapStatus(swapId, {isRefunded: true, state: -3});
      const status2 = await getSwapStatus(swapId);
      expect(status2.status).toBe('refunded');

      // Change mock to paid — should NOT change because refunded is terminal
      atomiqMock.setSwapStatus(swapId, {isPaid: true, state: 1});
      const status3 = await getSwapStatus(swapId);
      expect(status3.status).toBe('refunded');
    });
  });
});
