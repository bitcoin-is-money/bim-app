import type {SwapGateway} from '@bim/domain/ports';
import {InsufficientBalanceError} from '@bim/domain/shared';
import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {ApiErrorResponse} from '../../../src/errors';
import {AtomiqGatewayMock} from '../../unit/mocks/atomiq.gateway.mock';
import {StarknetGatewayMock} from '../../unit/mocks/starknet.gateway.mock';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

// STRK token address (same as in app-context.ts)
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

/**
 * Receive — Insufficient Balance (Security Deposit)
 *
 * When a Bitcoin receive requires a security deposit (STRK approve + commit)
 * and the account lacks funds, the API should return a clear 400 error with
 * the INSUFFICIENT_BALANCE_SECURITY_DEPOSIT code.
 */
describe('Receive — Insufficient Balance for Security Deposit', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let atomiqMock: AtomiqGatewayMock;
  let starknetMock: StarknetGatewayMock;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;

  let sessionCookie: string;

  const STARKNET_ADDRESS = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // Simple DEX mock for auto-swap tests
  const dexMock: SwapGateway = {
    async checkHealth() { /* no-op */ },
    async getSwapCalls() {
      return {
        calls: [{contractAddress: '0xavnu', entrypoint: 'swap', calldata: []}],
        sellAmount: 10000n, // 0.0001 WBTC (8 decimals)
        buyAmount: 73000000000000000000n, // 73 STRK
      };
    },
  };

  beforeAll(async () => {
    atomiqMock = new AtomiqGatewayMock();
    starknetMock = new StarknetGatewayMock();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);

    app = await TestApp.createTestApp({
      context: {
        gateways: {atomiq: atomiqMock, starknet: starknetMock, dex: dexMock},
      },
    });
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    atomiqMock.clearSwaps();
    starknetMock.setBuildCallsError(null);

    const account = await accountFixture.insertAccount({
      status: 'deployed',
      starknetAddress: STARKNET_ADDRESS,
    });
    const session = await authFixture.insertSession(account.id);
    sessionCookie = `session=${session.id}`;
  });

  afterAll(async () => {
    await pool.end();
  });

  function request() {
    return TestApp.request(app);
  }

  it('returns INSUFFICIENT_BALANCE_SECURITY_DEPOSIT with STRK info when buildCalls fails', async () => {
    // Simulate: paymaster simulation fails because account lacks funds for security deposit
    starknetMock.setBuildCallsError(new InsufficientBalanceError());

    const response = await request().post('/api/payment/receive', {
      network: 'bitcoin',
      amount: '100000',
    }, {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(400);
    const body = await response.json() as ApiErrorResponse;
    expect(body.error.code).toBe('INSUFFICIENT_BALANCE_SECURITY_DEPOSIT');
    expect(body.error.message).toContain('security deposit');
    expect(body.error.args).toBeDefined();
    expect(body.error.args!.amount).toBeDefined();
    expect(body.error.args!.token).toBe('STRK');
  });

  it('returns INSUFFICIENT_BALANCE_SECURITY_DEPOSIT with WBTC info when auto-swap pre-check fails', async () => {
    // Set up: Atomiq returns commit calls with STRK approve (triggers auto-swap path)
    const securityDepositStrk = 73000000000000000000n; // 73 STRK
    atomiqMock.setBitcoinCommitCalls([
      {
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'approve',
        calldata: ['0xspender', securityDepositStrk.toString(), '0x0'],
      },
    ]);

    // Account has 0 STRK (triggers auto-swap) and insufficient WBTC
    starknetMock.setBalance('STRK', 0n);
    starknetMock.setBalance('WBTC', 100n); // 0.000001 WBTC — not enough for the swap

    const response = await request().post('/api/payment/receive', {
      network: 'bitcoin',
      amount: '100000',
    }, {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(400);
    const body = await response.json() as ApiErrorResponse;
    expect(body.error.code).toBe('INSUFFICIENT_BALANCE_SECURITY_DEPOSIT');
    expect(body.error.message).toContain('security deposit');
    expect(body.error.message).toContain('WBTC');
    expect(body.error.args).toBeDefined();
    expect(body.error.args!.token).toBe('WBTC');
    expect(body.error.args!.amount).toBe('0.0001'); // 10000 in 8 decimals = 0.0001 WBTC
  });
});
