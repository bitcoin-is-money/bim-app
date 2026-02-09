import {WebauthnVirtualAuthenticator} from "@bim/test-toolkit/auth";
import {sql} from 'drizzle-orm';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {ApiErrorResponse} from '../../../src/errors';
import type {
  BeginRegistrationResponse,
  SessionAuthenticatedResponse,
  SessionUnauthenticatedResponse
} from '../../../src/routes';
import {registerUser, toRegistrationOptions} from '../../helpers';
import {type DbClient, StrkDevnetContext, TestApp, TestDatabase,} from '../helpers';

/**
 * Complete Registration Flow Integration Tests
 *
 * Tests the full account registration flow through the HTTP API:
 * 1. POST /api/auth/register/begin - Start WebAuthn registration
 * 2. VirtualAuthenticator creates credential (simulates browser/device)
 * 3. POST /api/auth/register/complete - Complete registration
 * 4. Verify the account is created with Starknet address
 */
describe('Registration Flow', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let authenticator: WebauthnVirtualAuthenticator;
  let strkContext: StrkDevnetContext;

  const rpId = 'localhost';

  beforeAll(() => {
    pool = TestDatabase.createPool();
    authenticator = new WebauthnVirtualAuthenticator();
    strkContext = StrkDevnetContext.create();
    db = TestDatabase.getClient(pool);
    app = TestApp.createTestApp({
      context: {
        gateways: {
          starknet: strkContext.getStarknetGateway(),
          paymaster: strkContext.getDevnetPaymasterGateway(),
        },
      },
    });

  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    authenticator.clear();
  });

  afterAll(async () => {
    if (strkContext) {
      strkContext.resetStarknetContext();
    }
    await pool.end();
  });

  describe('POST /api/auth/register/begin', () => {
    it('returns WebAuthn registration options and challenge ID', async () => {
      const response = await TestApp
        .request(app)
        .post('/api/auth/register/begin', {
          username: 'alice',
        });

      expect(response.status).toBe(200);
      const body = await response.json() as BeginRegistrationResponse;

      expect(body.challengeId).toBeDefined();
      expect(body.options.challenge).toBeDefined();
      expect(body.options.rpId).toBe(rpId);
      expect(body.options.userName).toBe('alice');
    });

    it('rejects invalid username', async () => {
      const response = await TestApp
        .request(app)
        .post('/api/auth/register/begin', {
          username: 'ab', // Too short
        });
      expect(response.status).toBe(400);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/register/complete', () => {
    it('creates account with valid WebAuthn credential and starknet address', async () => {
      const username = 'bob';
      const {completeResponse, account} = await registerUser(TestApp.request(app), authenticator, username);

      expect(completeResponse.status).toBe(200);

      expect(account.id).toBeDefined();
      expect(account.username).toBe(username);
      expect(account.status).toBe('pending');

      // Verify the session cookie is set
      const setCookie = completeResponse.headers.get('Set-Cookie');
      expect(setCookie).toContain('session=');

      // Starknet address is null after registration (computed during deployment)
      expect(account.starknetAddress).toBeNull();
    });

    it('rejects duplicate username', async () => {
      const username = 'duplicate_user';
      const requester = TestApp.request(app);

      // First registration should succeed
      const {completeResponse: first} = await registerUser(requester, authenticator, username);
      expect(first.status).toBe(200);

      // Second registration with the same username should fail
      const {completeResponse: second} = await registerUser(requester, authenticator, username);
      expect(second.status).toBe(409);
      const body = await second.json() as ApiErrorResponse;
      expect(body.error.code).toBe('ACCOUNT_ALREADY_EXISTS');
    });

    it('rejects expired challenge', async () => {
      const username = 'expired_user';

      // Begin registration
      const beginResponse = await TestApp
        .request(app)
        .post('/api/auth/register/begin', {username});
      const beginBody = await beginResponse.json() as BeginRegistrationResponse;

      // Create credential
      const credential = await authenticator
        .createCredential(toRegistrationOptions(beginBody));

      // Expire the challenge by updating it in the database
      await db.execute(
        sql`UPDATE challenges
            SET expires_at = NOW() - INTERVAL '1 minute'
            WHERE id = ${beginBody.challengeId}`,
      );

      // Try to complete - should fail
      const completeResponse = await TestApp
        .request(app)
        .post('/api/auth/register/complete', {
          challengeId: beginBody.challengeId,
          accountId: beginBody.accountId,
          username,
          credential,
        });

      expect(completeResponse.status).toBe(400);
      const body = await completeResponse.json() as ApiErrorResponse;
      expect(body.error.code).toBe('CHALLENGE_EXPIRED');
    });

    it('rejects invalid challenge ID', async () => {
      const username = 'invalid_challenge';

      // Begin registration to get valid options
      const beginResponse = await TestApp
        .request(app)
        .post('/api/auth/register/begin', {username});
      const beginBody = await beginResponse.json() as BeginRegistrationResponse;

      // Create credential
      const credential = await authenticator
        .createCredential(toRegistrationOptions(beginBody));

      // Try to complete with a random challenge ID
      const completeResponse = await TestApp
        .request(app)
        .post('/api/auth/register/complete', {
          challengeId: '00000000-0000-0000-0000-000000000000',
          accountId: beginBody.accountId,
          username,
          credential,
        });

      expect(completeResponse.status).toBe(400);
      const body = await completeResponse.json() as ApiErrorResponse;
      expect(body.error.code).toBe('CHALLENGE_NOT_FOUND');
    });
  });

  describe('GET /api/auth/session', () => {
    it('returns authenticated state after registration', async () => {
      const username = 'session_test';
      const {sessionCookie} = await registerUser(TestApp.request(app), authenticator, username);

      // Check session
      const sessionResponse = await TestApp
        .request(app)
        .get('/api/auth/session', {
          headers: {Cookie: sessionCookie},
        });

      expect(sessionResponse.status).toBe(200);
      const body = await sessionResponse.json() as SessionAuthenticatedResponse;
      expect(body.authenticated).toBe(true);
      expect(body.account.username).toBe(username);
    });

    it('returns unauthenticated without session cookie', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/auth/session');

      expect(response.status).toBe(401);
      const body = await response.json() as SessionUnauthenticatedResponse;
      expect(body.authenticated).toBe(false);
    });
  });
});
