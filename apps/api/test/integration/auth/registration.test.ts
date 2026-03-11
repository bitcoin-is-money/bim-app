import {WebauthnVirtualAuthenticator} from "@bim/test-toolkit/auth";
import {sql} from 'drizzle-orm';
import type {Hono} from 'hono';
import type pg from 'pg';
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

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    authenticator = new WebauthnVirtualAuthenticator();
    strkContext = StrkDevnetContext.create();
    db = TestDatabase.getClient(pool);
    app = await TestApp.createTestApp({
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
        sql`UPDATE bim_challenges
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

    it('rejects registration with a different accountId than the one bound to the challenge', async () => {
      const username = 'tampered_account';

      // Begin registration — server returns challengeId + accountId
      const beginResponse = await TestApp
        .request(app)
        .post('/api/auth/register/begin', {username});
      const beginBody = await beginResponse.json() as BeginRegistrationResponse;

      // Create credential with the original accountId (as WebAuthn would)
      const credential = await authenticator
        .createCredential(toRegistrationOptions(beginBody));

      // Complete registration with a DIFFERENT accountId (attacker-controlled)
      const tamperedAccountId = '00000000-0000-4000-a000-000000000000';
      const completeResponse = await TestApp
        .request(app)
        .post('/api/auth/register/complete', {
          challengeId: beginBody.challengeId,
          accountId: tamperedAccountId,
          username,
          credential,
        });

      expect(completeResponse.status).toBe(400);
      const body = await completeResponse.json() as ApiErrorResponse;
      expect(body.error.code).toBe('INVALID_CHALLENGE');
    });

    it('rejects authentication challenge used for registration', async () => {
      const username = 'cross_purpose';

      // Start an AUTHENTICATION challenge (wrong purpose)
      const authBeginResponse = await TestApp
        .request(app)
        .post('/api/auth/login/begin', {});
      const authBeginBody = await authBeginResponse.json() as { challengeId: string };

      // Start a REGISTRATION to get valid credential options
      const regBeginResponse = await TestApp
        .request(app)
        .post('/api/auth/register/begin', {username});
      const regBeginBody = await regBeginResponse.json() as BeginRegistrationResponse;

      // Create credential using the registration options
      const credential = await authenticator
        .createCredential(toRegistrationOptions(regBeginBody));

      // Try to complete registration using the AUTHENTICATION challenge ID
      const completeResponse = await TestApp
        .request(app)
        .post('/api/auth/register/complete', {
          challengeId: authBeginBody.challengeId,
          accountId: regBeginBody.accountId,
          username,
          credential,
        });

      expect(completeResponse.status).toBe(400);
      const body = await completeResponse.json() as ApiErrorResponse;
      expect(body.error.code).toBe('INVALID_CHALLENGE');
    });

    it('rolls back challenge consumption when account creation fails', async () => {
      const username = 'rollback_test';

      // Begin registration
      const beginResponse = await TestApp
        .request(app)
        .post('/api/auth/register/begin', {username});
      const beginBody = await beginResponse.json() as BeginRegistrationResponse;

      // Create valid credential
      const credential = await authenticator
        .createCredential(toRegistrationOptions(beginBody));

      // Install a trigger that rejects INSERT on bim_accounts for this username.
      // This makes accountRepository.save() fail AFTER challengeRepository.save() succeeds,
      // simulating a race condition or unexpected DB failure between the two saves.
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fail_account_insert() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'simulated account creation failure';
        END;
        $$ LANGUAGE plpgsql;
      `);
      await db.execute(sql`
        CREATE TRIGGER fail_account_insert_trigger
          BEFORE INSERT ON bim_accounts
          FOR EACH ROW
          EXECUTE FUNCTION fail_account_insert();
      `);

      try {
        // Complete should fail (trigger rejects account insert, after challenge was already saved as used)
        const completeResponse = await TestApp
          .request(app)
          .post('/api/auth/register/complete', {
            challengeId: beginBody.challengeId,
            accountId: beginBody.accountId,
            username,
            credential,
          });
        expect(completeResponse.status).not.toBe(200);

        // Challenge should NOT be consumed (transaction should have rolled back)
        const challengeRow = await db.execute(
          sql`SELECT used FROM bim_challenges WHERE id = ${beginBody.challengeId}`,
        );
        expect((challengeRow.rows[0] as {used: boolean}).used).toBe(false);
      } finally {
        // Clean up trigger
        await db.execute(sql`DROP TRIGGER IF EXISTS fail_account_insert_trigger ON bim_accounts`);
        await db.execute(sql`DROP FUNCTION IF EXISTS fail_account_insert()`);
      }
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

      expect(response.status).toBe(200);
      const body = await response.json() as SessionUnauthenticatedResponse;
      expect(body.authenticated).toBe(false);
    });
  });
});
