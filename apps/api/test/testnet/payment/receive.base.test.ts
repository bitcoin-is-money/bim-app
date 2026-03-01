import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {ApiErrorResponse} from '../../../src/errors';
import {registerUser} from '../../helpers';
import {TestDatabase, TestnetApp} from '../helpers';

/**
 * Receive Flow — Base Tests (Testnet)
 *
 * Tests basic validation and error handling for the receive endpoint.
 * These tests do NOT require a deployed account on Sepolia.
 */
describe('Receive Flow — Base (Testnet)', () => {
  let app: Hono;
  let pool: pg.Pool;
  let authenticator: WebauthnVirtualAuthenticator;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    authenticator = new WebauthnVirtualAuthenticator();
    app = await TestnetApp.createTestApp();
  });

  afterAll(async () => {
    await pool.end();
  });

  function register(username: string) {
    return registerUser(TestnetApp.request(app), authenticator, username);
  }

  it('rejects unauthenticated receive request', async () => {
    const response = await TestnetApp
      .request(app)
      .post('/api/payment/receive', {
        network: 'starknet',
        amount: '1000',
      });

    expect(response.status).toBe(401);
    const body = await response.json() as ApiErrorResponse;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects receive for non-deployed account', async () => {
    const {sessionCookie} = await register('tn_recv_base_pending');

    const response = await TestnetApp
      .request(app)
      .post('/api/payment/receive', {
        network: 'starknet',
        amount: '1000',
      }, {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(400);
    const body = await response.json() as ApiErrorResponse;
    expect(body.error.code).toBe('ACCOUNT_NOT_DEPLOYED');
  });
});
