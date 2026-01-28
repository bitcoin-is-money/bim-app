import {UuidCodec} from '@bim/lib/encoding';
import {
  type CredentialCreationOptions,
  type CredentialRequestOptions,
  WebauthnVirtualAuthenticator
} from "@bim/test-toolkit/auth";
import {eq} from 'drizzle-orm';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import * as schema from '../../../database/schema';
import type {
  BeginAuthenticationResponse,
  BeginRegistrationResponse,
  CompleteAuthenticationResponse
} from "../../../src/routes";
import {type DbClient, StrkDevnetContext, TestApp, TestDatabase,} from '../helpers';

// The expected origin matches WEBAUTHN_ORIGIN env var set in test-app.ts
const webAuthnOrigin = 'http://localhost:8080';


/**
 * Converts API registration options to WebauthnVirtualAuthenticator format.
 */
function toRegistrationOptions(
  apiResponse: BeginRegistrationResponse
): CredentialCreationOptions {
  return {
    challenge: apiResponse.options.challenge,
    rp: {
      id: apiResponse.options.rpId,
      name: apiResponse.options.rpName,
    },
    user: {
      id: UuidCodec.toBase64Url(apiResponse.options.userId), // Convert UUID to base64url bytes
      name: apiResponse.options.userName,
      displayName: apiResponse.options.userName,
    },
    origin: webAuthnOrigin,
  };
}

/**
 * Converts API authentication options to WebauthnVirtualAuthenticator format.
 * For usernameless flow, allowCredentials is empty and userHandle must be returned.
 */
function toAuthenticationOptions(
  apiResponse: BeginAuthenticationResponse,
  rpId: string,
): CredentialRequestOptions {
  return {
    challenge: apiResponse.options.challenge,
    rpId,
    allowCredentials: apiResponse.options.allowCredentials,
    origin: webAuthnOrigin,
  };
}

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

  beforeAll(() => {
    authenticator = new WebauthnVirtualAuthenticator();
    strkContext = StrkDevnetContext.create();
    app = TestApp.createTestApp({
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

  /**
   * Helper to register a user and return the session cookie.
   */
  async function registerUser(username: string): Promise<{
    sessionCookie: string;
    accountId: string;
  }> {
    const beginResponse = await TestApp
      .request(app)
      .post('/api/auth/register/begin', {username});
    const beginBody = await beginResponse.json() as BeginRegistrationResponse;
    const credential = await authenticator
      .createCredential(toRegistrationOptions(beginBody));
    const completeResponse = await TestApp
      .request(app)
      .post('/api/auth/register/complete', {
        challengeId: beginBody.challengeId,
        accountId: beginBody.accountId, // Pass accountId from begin to complete
        username,
        credential,
      });

    const completeBody = await completeResponse.json() as CompleteAuthenticationResponse;
    const setCookie = completeResponse.headers.get('Set-Cookie') || '';
    const sessionMatch = /session=([^;]+)/.exec(setCookie);
    const sessionCookie = sessionMatch ? `session=${sessionMatch[1]}` : '';

    return {
      sessionCookie,
      accountId: completeBody.account.id,
    };
  }

  /**
   * Helper to perform full login flow (usernameless - discoverable credentials).
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
      await registerUser(username);

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
      const {accountId} = await registerUser(username);

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
      await registerUser(username);

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
    });

    it('rejects tampered assertion signature', async () => {
      const username = 'tampered_sig_user';
      await registerUser(username);

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
    });
  });

  describe('Session Management', () => {
    it('allows access to protected resource with valid session', async () => {
      const username = 'session_valid_user';
      await registerUser(username);
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
      const body = await sessionResponse.json() as {
        authenticated: boolean;
        account: { username: string };
      };
      expect(body.authenticated).toBe(true);
      expect(body.account.username).toBe(username);
    });

    it('rejects access without session cookie', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/auth/session');

      expect(response.status).toBe(401);
      const body = await response.json() as { authenticated: boolean };
      expect(body.authenticated).toBe(false);
    });

    it('rejects access with invalid session cookie', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/auth/session', {
          headers: {Cookie: 'session=invalid-session-id'},
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('invalidates session on logout', async () => {
      const username = 'logout_user';
      const {sessionCookie} = await registerUser(username);

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
      const afterLogout = await TestApp
        .request(app)
        .get('/api/auth/session', {
          headers: {Cookie: sessionCookie},
        });
      expect(afterLogout.status).toBe(401);
    });

    it('succeeds even without session cookie', async () => {
      const response = await TestApp
        .request(app)
        .post('/api/auth/logout', {});

      expect(response.status).toBe(200);
      const body = await response.json() as { success: boolean };
      expect(body.success).toBe(true);
    });
  });
});
