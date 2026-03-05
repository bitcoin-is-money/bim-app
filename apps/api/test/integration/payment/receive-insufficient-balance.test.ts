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

  beforeAll(async () => {
    atomiqMock = new AtomiqGatewayMock();
    starknetMock = new StarknetGatewayMock();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);

    app = await TestApp.createTestApp({
      context: {
        gateways: {atomiq: atomiqMock, starknet: starknetMock},
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

  it('returns INSUFFICIENT_BALANCE_SECURITY_DEPOSIT when buildCalls fails due to insufficient funds', async () => {
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
  });
});
