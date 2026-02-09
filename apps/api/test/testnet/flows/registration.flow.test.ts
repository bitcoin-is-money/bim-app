import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {BeginRegistrationResponse, SessionAuthenticatedResponse} from '../../../src/routes/auth/auth.types';
import {registerUser} from '../../helpers';
import {TestDatabase, TestnetApp} from '../helpers';

/**
 * Registration Flow — Testnet
 *
 * Tests WebAuthn registration through the HTTP API on a real Sepolia configuration.
 * No gateway overrides: the app uses real AvnuPaymasterGateway + StarknetRpcGateway.
 * Registration itself does not interact with the blockchain (no deployment yet).
 */
describe('Registration Flow (Testnet)', () => {
  let app: Hono;
  let pool: pg.Pool;
  let authenticator: WebauthnVirtualAuthenticator;

  const rpId = 'localhost';

  beforeAll(() => {
    pool = TestDatabase.createPool();
    authenticator = new WebauthnVirtualAuthenticator();
    app = TestnetApp.createTestApp();
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    authenticator.clear();
  });

  afterAll(async () => {
    await pool.end();
  });

  function register(username: string) {
    return registerUser(TestnetApp.request(app), authenticator, username);
  }

  describe('POST /api/auth/register/begin', () => {
    it('returns WebAuthn registration options and challenge ID', async () => {
      const response = await TestnetApp
        .request(app)
        .post('/api/auth/register/begin', {username: 'tn_alice'});

      expect(response.status).toBe(200);
      const body = await response.json() as BeginRegistrationResponse;

      expect(body.challengeId).toBeDefined();
      expect(body.options.challenge).toBeDefined();
      expect(body.options.rpId).toBe(rpId);
      expect(body.options.userName).toBe('tn_alice');
    });

    it('rejects invalid username', async () => {
      const response = await TestnetApp
        .request(app)
        .post('/api/auth/register/begin', {username: 'ab'});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/register/complete', () => {
    it('creates account with pending status and no starknet address', async () => {
      const {completeResponse, account} = await register('tn_bob');

      expect(completeResponse.status).toBe(200);

      expect(account.id).toBeDefined();
      expect(account.username).toBe('tn_bob');
      expect(account.status).toBe('pending');
      expect(account.starknetAddress).toBeNull();

      const setCookie = completeResponse.headers.get('Set-Cookie');
      expect(setCookie).toContain('session=');
    });

    it('rejects duplicate username', async () => {
      const {completeResponse: first} = await register('tn_duplicate');
      expect(first.status).toBe(200);

      const {completeResponse: second} = await register('tn_duplicate');
      expect(second.status).toBe(409);
    });
  });

  describe('GET /api/auth/session', () => {
    it('returns authenticated state after registration', async () => {
      const {sessionCookie} = await register('tn_session');

      const sessionResponse = await TestnetApp
        .request(app)
        .get('/api/auth/session', {
          headers: {Cookie: sessionCookie},
        });

      expect(sessionResponse.status).toBe(200);
      const body = await sessionResponse.json() as SessionAuthenticatedResponse;
      expect(body.authenticated).toBe(true);
      expect(body.account.username).toBe('tn_session');
    });

    it('returns unauthenticated without session cookie', async () => {
      const response = await TestnetApp
        .request(app)
        .get('/api/auth/session');

      expect(response.status).toBe(401);
    });
  });
});
