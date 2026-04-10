import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import * as schema from '@bim/db';

import type {ActiveSwapsResponse} from '../../../src/routes';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

/**
 * GET /api/swap/active — Integration Test
 *
 * Used by the PWA update flow on the frontend: after a successful login
 * the client calls this endpoint to know whether it is safe to apply a
 * pending client update. The response shape is intentionally minimal
 * ({ active, count }) — no personal data is leaked.
 */
describe('GET /api/swap/active', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;

  let accountId: string;
  let otherAccountId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);

    app = await TestApp.createTestApp();
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);

    const account = await accountFixture.insertAccount({
      username: 'activeSwapsUser',
      status: 'deployed',
      starknetAddress: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    accountId = account.id;

    const otherAccount = await accountFixture.insertAccount({
      username: 'otherUser',
      status: 'deployed',
      starknetAddress: '0x0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    otherAccountId = otherAccount.id;

    const session = await authFixture.insertSession(account.id);
    sessionCookie = `session=${session.id}`;
  });

  afterAll(async () => {
    await pool.end();
  });

  function request() {
    return TestApp.request(app);
  }

  async function insertSwap(overrides: Partial<schema.NewSwapRecord>): Promise<void> {
    const defaults: schema.NewSwapRecord = {
      id: `swap-${Math.random().toString(36).slice(2, 10)}`,
      direction: 'lightning_to_starknet',
      amountSats: '50000',
      destinationAddress: '0xdeadbeef',
      description: 'test swap',
      accountId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    await db.insert(schema.swaps).values({...defaults, ...overrides});
  }

  it('returns 401 when no session cookie is provided', async () => {
    const response = await request().get('/api/swap/active');
    expect(response.status).toBe(401);
  });

  it('returns { active: false, count: 0 } when the account has no swaps', async () => {
    const response = await request().get('/api/swap/active', {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    const body = await response.json() as ActiveSwapsResponse;
    expect(body).toEqual({active: false, count: 0});
  });

  it('returns { active: false, count: 0 } when all swaps are terminal', async () => {
    await insertSwap({id: 'swap-completed', status: 'completed'});
    await insertSwap({id: 'swap-expired', status: 'expired'});
    await insertSwap({id: 'swap-refunded', status: 'refunded'});
    await insertSwap({id: 'swap-failed', status: 'failed'});

    const response = await request().get('/api/swap/active', {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    const body = await response.json() as ActiveSwapsResponse;
    expect(body).toEqual({active: false, count: 0});
  });

  it('counts only non-terminal swaps for the authenticated account', async () => {
    await insertSwap({id: 'swap-pending-1', status: 'pending'});
    await insertSwap({id: 'swap-paid-1', status: 'paid'});
    await insertSwap({id: 'swap-completed-1', status: 'completed'});

    const response = await request().get('/api/swap/active', {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    const body = await response.json() as ActiveSwapsResponse;
    expect(body).toEqual({active: true, count: 2});
  });

  it('ignores swaps belonging to other accounts', async () => {
    await insertSwap({id: 'swap-mine', status: 'pending'});
    await insertSwap({id: 'swap-other-1', status: 'pending', accountId: otherAccountId});
    await insertSwap({id: 'swap-other-2', status: 'paid', accountId: otherAccountId});

    const response = await request().get('/api/swap/active', {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    const body = await response.json() as ActiveSwapsResponse;
    expect(body).toEqual({active: true, count: 1});
  });
});
