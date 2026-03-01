import * as schema from '@bim/db';
import {WebauthnVirtualAuthenticator} from "@bim/test-toolkit/auth";
import {eq} from 'drizzle-orm';
import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {ApiErrorResponse} from '../../../src/errors';
import type {
  BeginAuthenticationResponse,
  CompleteAuthenticationResponse,
  LogoutResponse,
  SessionAuthenticatedResponse,
  SessionUnauthenticatedResponse,
} from "../../../src/routes";
import {registerUser, toAuthenticationOptions} from '../../helpers';
import {type DbClient, StrkDevnetContext, TestApp, TestDatabase,} from '../helpers';

/**
 * Complete Authentication Flow Integration Tests
 *
 * Tests the full login flow through the HTTP API:
 * 1. Register a user first
 * 2. POST /api/auth/login/begin - Start WebAuthn authentication
 * 3. VirtualAuthenticator creates assertion (simulates browser/device)
 * 4. POST /api/auth/login/complete - Complete authentication
 * 5. Verify session is established
 */
describe('Authentication Flow', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let authenticator: WebauthnVirtualAuthenticator;
  let strkContext: StrkDevnetContext;

  const rpId = 'localhost';

  beforeAll(async () => {
    authenticator = new WebauthnVirtualAuthenticator();
    strkContext = StrkDevnetContext.create();
    app = await TestApp.createTestApp({
      context: {
        gateways: {
          starknet: strkContext.getStarknetGateway(),
          paymaster: strkContext.getDevnetPaymasterGateway(),
        },
      },
    });
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    authenticator.clear();
  });

  afterAll(async () => {
    strkContext.resetStarknetContext();
    await pool.end();
  });

  async function register(username: string) {
    const result = await registerUser(TestApp.request(app), authenticator, username);
    return {sessionCookie: result.sessionCookie, accountId: result.account.id};
  }

  /**
   * Helper to perform a full login flow (usernameless - discoverable credentials).
   * The authenticator returns userHandle which identifies the user.
   */
  async function loginUser(): Promise<{
    beginBody: BeginAuthenticationResponse;
    completeResponse: Response;
  }> {
    const beginResponse = await TestApp
      .request(app)
      .post('/api/auth/login/begin', {});
    const beginBody = await beginResponse.json() as BeginAuthenticationResponse;
    const assertion = await authenticator
      .getAssertion(toAuthenticationOptions(beginBody, rpId));
    const completeResponse = await TestApp
      .request(app)
      .post('/api/auth/login/complete', {
        challengeId: beginBody.challengeId,
        credential: assertion,
      });
    return {beginBody, completeResponse};
  }

  describe('POST /api/auth/login/begin', () => {
    it('returns WebAuthn authentication options for usernameless flow', async () => {
      const response = await TestApp
        .request(app)
        .post('/api/auth/login/begin', {});

      expect(response.status).toBe(200);
      const body = await response.json() as BeginAuthenticationResponse;

      expect(body.challengeId).toBeDefined();
      expect(body.options.challenge).toBeDefined();
      expect(body.options.rpId).toBe(rpId);
      // Usernameless flow: allowCredentials is empty (discoverable credentials)
      expect(body.options.allowCredentials).toHaveLength(0);
      expect(body.options.userVerification).toBe('required');
    });
  });

  describe('POST /api/auth/login/complete', () => {
    it('authenticates user with valid WebAuthn assertion (usernameless)', async () => {
      const username = 'auth_complete_user';
      await register(username);

      const {completeResponse} = await loginUser();

      expect(completeResponse.status).toBe(200);
      const body = await completeResponse.json() as CompleteAuthenticationResponse;

      expect(body.account.id).toBeDefined();
      expect(body.account.username).toBe(username);

      // Verify the session cookie is set
      const setCookie = completeResponse.headers.get('Set-Cookie');
      expect(setCookie).toContain('session=');

      // Starknet address is null until deployment
      expect(body.account.starknetAddress).toBeNull();
    });

    it('increments sign count after successful authentication', async () => {
      const username = 'signCountUser';
      const {accountId} = await register(username);

      async function expectSignCount(expected: number): Promise<void> {
        const result = await db
          .select({signCount: schema.accounts.signCount})
          .from(schema.accounts)
          .where(eq(schema.accounts.id, accountId))
          .then(rows => rows[0]);
        expect(result?.signCount).toBe(expected);
      }

      await expectSignCount(0);

      // First login
      await loginUser();
      await expectSignCount(1);

      // Second login
      const {completeResponse} = await loginUser();
      expect(completeResponse.status).toBe(200);
      await expectSignCount(2);
    });

    it('rejects invalid challenge ID', async () => {
      const username = 'bad_challenge';
      await register(username);

      // Start login to get valid assertion options
      const beginResponse = await TestApp
        .request(app)
        .post('/api/auth/login/begin', {});
      const beginBody = await beginResponse.json() as BeginAuthenticationResponse;
      const assertion = await authenticator
        .getAssertion(toAuthenticationOptions(beginBody, rpId));

      // Try to complete with the wrong challenge ID
      const completeResponse = await TestApp
        .request(app)
        .post('/api/auth/login/complete', {
          challengeId: '00000000-0000-0000-0000-000000000000',
          credential: assertion,
        });

      expect(completeResponse.status).toBe(400);
      const body = await completeResponse.json() as ApiErrorResponse;
      expect(body.error.code).toBe('CHALLENGE_NOT_FOUND');
    });

    it('rejects tampered assertion signature', async () => {
      const username = 'tampered_sig_user';
      await register(username);

      const beginResponse = await TestApp
        .request(app)
        .post('/api/auth/login/begin', {});
      const beginBody = await beginResponse.json() as BeginAuthenticationResponse;
      const assertion = await authenticator
        .getAssertion(toAuthenticationOptions(beginBody, rpId));

      // Tamper with the signature (change a character)
      const tamperedAssertion = {
        ...assertion,
        response: {
          ...assertion.response,
          signature: assertion.response.signature.slice(0, -4) + 'AAAA',
        },
      };

      const completeResponse = await TestApp
        .request(app)
        .post('/api/auth/login/complete', {
          challengeId: beginBody.challengeId,
          credential: tamperedAssertion,
        });

      expect(completeResponse.status).toBe(401);
      const body = await completeResponse.json() as ApiErrorResponse;
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });
  });

  describe('Session Management', () => {
    it('allows access to protected resource with valid session', async () => {
      const username = 'session_valid_user';
      await register(username);
      const {completeResponse} = await loginUser();

      const setCookie = completeResponse.headers.get('Set-Cookie') || '';
      const sessionMatch = /session=([^;]+)/.exec(setCookie);
      const sessionCookie = sessionMatch ? `session=${sessionMatch[1]}` : '';

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

    it('returns unauthenticated with invalid session cookie', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/auth/session', {
          headers: {Cookie: 'session=invalid-session-id'},
        });

      expect(response.status).toBe(200);
      const body = await response.json() as SessionUnauthenticatedResponse;
      expect(body.authenticated).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('invalidates session on logout', async () => {
      const username = 'logout_user';
      const {sessionCookie} = await register(username);

      // Verify session is valid before logout
      const beforeLogout = await TestApp
        .request(app)
        .get('/api/auth/session', {
          headers: {Cookie: sessionCookie},
        });
      expect(beforeLogout.status).toBe(200);

      // Logout
      const logoutResponse = await TestApp
        .request(app)
        .post('/api/auth/logout', {}, {
          headers: {Cookie: sessionCookie},
        });
      expect(logoutResponse.status).toBe(200);

      // Verify session is invalid after logout
      const afterLogoutResponse = await TestApp
        .request(app)
        .get('/api/auth/session', {
          headers: {Cookie: sessionCookie},
        });
      expect(afterLogoutResponse.status).toBe(200);
      const body = await afterLogoutResponse.json() as SessionUnauthenticatedResponse;
      expect(body.authenticated).toBe(false);
    });

    it('succeeds even without session cookie', async () => {
      const response = await TestApp
        .request(app)
        .post('/api/auth/logout', {});

      expect(response.status).toBe(200);
      const body = await response.json() as LogoutResponse;
      expect(body.success).toBe(true);
    });
  });
});
