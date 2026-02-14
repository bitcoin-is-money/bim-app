import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {AppInstance} from '../../../src/app';
import type {ApiErrorResponse} from '../../../src/errors';
import type {SwapMonitor} from '../../../src/monitoring/swap.monitor';
import type {BitcoinReceiveResponse, SwapStatusResponse} from '../../../src/routes';
import {AtomiqGatewayMock} from '../../unit/mocks/atomiq.gateway.mock';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

/**
 * Bitcoin Receive Swap Lifecycle — Integration Tests
 *
 * Tests the full Bitcoin → Starknet swap lifecycle through the HTTP API:
 * creation, status polling, payment detection, SwapMonitor auto-claim,
 * completion, expiration, and edge cases.
 *
 * Uses AtomiqGatewayMock to control swap status transitions without
 * requiring a real Bitcoin network or Atomiq SDK.
 */
describe('Bitcoin Receive Swap Lifecycle', () => {
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

  async function createBitcoinSwap(amount = '100000'): Promise<BitcoinReceiveResponse> {
    const response = await request().post('/api/payment/receive', {
      network: 'bitcoin',
      amount,
    }, {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    return await response.json() as BitcoinReceiveResponse;
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
    it('creates a Bitcoin swap with deposit address and BIP-21 URI', async () => {
      const body = await createBitcoinSwap('100000');

      expect(body.network).toBe('bitcoin');
      expect(body.swapId).toBeDefined();
      expect(body.depositAddress).toBeDefined();
      expect(body.bip21Uri).toContain('bitcoin:');
      expect(body.bip21Uri).toContain(body.depositAddress);
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
      const swap = await createBitcoinSwap();
      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('pending');
      expect(status.progress).toBe(0);
      expect(status.direction).toBe('bitcoin_to_starknet');
      expect(status.txHash).toBeUndefined();
    });

    it('returns paid status after payment detected', async () => {
      const swap = await createBitcoinSwap();

      // Simulate: Atomiq detects BTC deposit
      atomiqMock.setSwapStatus(swap.swapId, {isPaid: true, state: 1});

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('paid');
      expect(status.progress).toBe(33);
    });

    it('returns expired status when swap expires', async () => {
      const swap = await createBitcoinSwap();

      atomiqMock.setSwapStatus(swap.swapId, {isExpired: true, state: -1});

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('expired');
    });

    it('returns failed status on error', async () => {
      const swap = await createBitcoinSwap();

      atomiqMock.setSwapStatus(swap.swapId, {isFailed: true, state: -3, error: 'SDK error'});

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('failed');
    });
  });

  // ---------------------------------------------------------------------------
  // SwapMonitor Auto-Claim
  // ---------------------------------------------------------------------------

  describe('SwapMonitor Auto-Claim', () => {
    it('auto-claims Bitcoin swap when payment is detected', async () => {
      const swap = await createBitcoinSwap();

      // Simulate: Atomiq detects BTC deposit
      atomiqMock.setSwapStatus(swap.swapId, {isPaid: true, state: 1});

      // First poll: sync status from Atomiq → marks as paid
      await getSwapStatus(swap.swapId);

      // Run monitor iteration: detects paid forward swap → auto-claims
      await monitor.runIteration();

      // After claim, the mock's claimSwap returns a txHash
      // and waitForClaimConfirmation resolves immediately
      // So the swap should transition to confirming or completed
      const status = await getSwapStatus(swap.swapId);

      // After auto-claim + async confirmation, status should be completed
      expect(['confirming', 'completed']).toContain(status.status);
      expect(status.txHash).toBeDefined();
    });

    it('transitions to completed after claim confirmation', async () => {
      const swap = await createBitcoinSwap();

      // Simulate paid → poll to sync
      atomiqMock.setSwapStatus(swap.swapId, {isPaid: true, state: 1});
      await getSwapStatus(swap.swapId);

      // Run monitor → auto-claim
      await monitor.runIteration();

      // Give async confirmation handler time to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      const status = await getSwapStatus(swap.swapId);

      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
      expect(status.txHash).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('keeps Bitcoin swap as paid when expired + paid (BTC is irreversible)', async () => {
      const swap = await createBitcoinSwap();

      // Edge case: Atomiq reports expired, but deposit was already confirmed
      atomiqMock.setSwapStatus(swap.swapId, {isExpired: true, isPaid: true, state: -1});

      const status = await getSwapStatus(swap.swapId);

      // Should be 'paid', NOT 'expired' — Bitcoin transactions are irreversible
      expect(status.status).toBe('paid');
    });

    it('rejects claim on non-paid swap', async () => {
      const swap = await createBitcoinSwap();

      const response = await request().post(`/api/swap/claim/${swap.swapId}`, {}, {
        headers: {Cookie: sessionCookie},
      });

      expect(response.status).toBe(400);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBeDefined();
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
      const swap = await createBitcoinSwap();

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
