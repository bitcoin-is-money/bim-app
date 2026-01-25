import {type CredentialCreationOptions, WebauthnVirtualAuthenticator} from "@bim/test-toolkit";
import {sql} from 'drizzle-orm';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {type DbClient, StrkDevnetContext, TestApp, TestDatabase,} from '../helpers';

/**
 * API response type from /api/auth/register/begin
 */
interface BeginRegistrationResponse {
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeout: number;
  };
  challengeId: string;
}

// The expected origin matches WEBAUTHN_ORIGIN env var set in test-app.ts
const webAuthnOrigin = 'http://localhost:8080';

/**
 * Converts API registration options to VirtualAuthenticator format.
 */
function toAuthenticatorOptions(apiResponse: BeginRegistrationResponse): CredentialCreationOptions {
  return {
    challenge: apiResponse.options.challenge,
    rp: {
      id: apiResponse.options.rpId,
      name: apiResponse.options.rpName,
    },
    user: {
      id: apiResponse.options.userId,
      name: apiResponse.options.userName,
      displayName: apiResponse.options.userName,
    },
    origin: webAuthnOrigin,
  };
}

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

  /**
   * Helper to perform the full registration flow.
   */
  async function registerUser(username: string) {
    const beginResponse = await TestApp
      .request(app)
      .post('/api/auth/register/begin', {username});
    const beginBody = await beginResponse.json() as BeginRegistrationResponse;
    const credential = await authenticator
      .createCredential(toAuthenticatorOptions(beginBody));
    const completeResponse = await TestApp
      .request(app)
      .post('/api/auth/register/complete', {
        challengeId: beginBody.challengeId,
        username,
        credential,
      });
    return {beginBody, credential, completeResponse};
  }

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
    });
  });

  describe('POST /api/auth/register/complete', () => {
    it('creates account with valid WebAuthn credential and starknet address', async () => {
      const username = 'bob';
      const {completeResponse} = await registerUser(username);

      expect(completeResponse.status).toBe(200);
      const body = await completeResponse.json() as {
        account: {
          id: string;
          username: string;
          starknetAddress: string | null;
          status: string;
        };
      };

      expect(body.account.id).toBeDefined();
      expect(body.account.username).toBe(username);
      expect(body.account.status).toBe('pending');

      // Verify the session cookie is set
      const setCookie = completeResponse.headers.get('Set-Cookie');
      expect(setCookie).toContain('session=');

      // Verify Starknet address is a valid 66-char hex string
      expect(body.account.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('rejects duplicate username', async () => {
      const username = 'duplicate_user';

      // First registration should succeed
      const {completeResponse: first} = await registerUser(username);
      expect(first.status).toBe(200);

      // Second registration with the same username should fail
      const {completeResponse: second} = await registerUser(username);
      expect(second.status).toBe(409); // Conflict
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
        .createCredential(toAuthenticatorOptions(beginBody));

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
          username,
          credential,
        });

      expect(completeResponse.status).toBe(400);
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
        .createCredential(toAuthenticatorOptions(beginBody));

      // Try to complete with a random challenge ID
      const completeResponse = await TestApp
        .request(app)
        .post('/api/auth/register/complete', {
          challengeId: '00000000-0000-0000-0000-000000000000',
          username,
          credential,
        });

      expect(completeResponse.status).toBe(400);
    });
  });

  describe('GET /api/auth/session', () => {
    it('returns authenticated state after registration', async () => {
      const username = 'session_test';
      const {completeResponse} = await registerUser(username);

      // Extract session cookie
      const setCookie = completeResponse.headers.get('Set-Cookie');
      const sessionMatch = /session=([^;]+)/.exec(setCookie || '');
      const sessionCookie = sessionMatch ? `session=${sessionMatch[1]}` : '';

      // Check session
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

    it('returns unauthenticated without session cookie', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/auth/session');

      expect(response.status).toBe(401);
      const body = await response.json() as { authenticated: boolean };
      expect(body.authenticated).toBe(false);
    });
  });
});
