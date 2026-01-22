import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {
  type DbClient,
  StrkDevnet,
  StrkDevnetContext,
  TestApp,
  TestDatabase,
  VirtualAuthenticator,
  type CredentialCreationOptions,
} from '../helpers';

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

/**
 * API response type from registration complete
 */
interface RegistrationCompleteResponse {
  account: {
    id: string;
    username: string;
    starknetAddress: string | null;
    status: string;
  };
}

/**
 * API response type from account/me
 */
interface AccountMeResponse {
  id: string;
  username: string;
  starknetAddress: string | null;
  status: string;
  deploymentTxHash: string | null;
  createdAt: string;
}

/**
 * API response type from deployment-status endpoint
 */
interface DeploymentStatusResponse {
  status: string;
  txHash: string | undefined;
  isDeployed: boolean;
}

// The expected origin matches WEBAUTHN_ORIGIN env var set in test-app.ts
const webAuthnOrigin = 'http://localhost:8080';

/**
 * Converts API registration options to VirtualAuthenticator format.
 */
function toRegistrationOptions(apiResponse: BeginRegistrationResponse): CredentialCreationOptions {
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
 * Account Deployment Flow Integration Tests
 *
 * Tests the account-related API endpoints through HTTP:
 * - GET /api/account/me - Account information
 * - GET /api/account/deployment-status - Deployment status polling
 * - POST /api/account/deploy - Trigger deployment (requires real paymaster)
 *
 * NOTE: Full deployment tests require a real paymaster or mocked infrastructure
 * because WebAuthn accounts need signature from the credential during deployment.
 * The tests here focus on API behavior that doesn't require actual chain deployment.
 */
describe('Account Deployment Flow', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let authenticator: VirtualAuthenticator;
  let strkContext: StrkDevnetContext | undefined;

  beforeAll(() => {
    authenticator = new VirtualAuthenticator();

    if (StrkDevnet.isAvailable()) {
      strkContext = StrkDevnetContext.create();
      app = TestApp.createTestApp({
        context: {
          gateways: {
            starknet: strkContext.getStarknetGateway(),
            paymaster: strkContext.getDevnetPaymasterGateway(),
          },
        },
      });
    } else {
      app = TestApp.createTestApp();
    }

    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
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
   * Helper to register a user and return session cookie + account info.
   */
  async function registerUser(username: string): Promise<{
    sessionCookie: string;
    account: RegistrationCompleteResponse['account'];
  }> {
    const beginResponse = await TestApp.request(app).post('/api/auth/register/begin', {username});
    const beginBody = await beginResponse.json() as BeginRegistrationResponse;
    const credential = await authenticator.createCredential(toRegistrationOptions(beginBody));

    const completeResponse = await TestApp.request(app).post('/api/auth/register/complete', {
      challengeId: beginBody.challengeId,
      username,
      credential,
    });

    const completeBody = await completeResponse.json() as RegistrationCompleteResponse;
    const setCookie = completeResponse.headers.get('Set-Cookie') || '';
    const sessionMatch = /session=([^;]+)/.exec(setCookie);
    const sessionCookie = sessionMatch ? `session=${sessionMatch[1]}` : '';

    return {
      sessionCookie,
      account: completeBody.account,
    };
  }

  describe('GET /api/account/me', () => {
    it('returns account info for authenticated user', async () => {
      if (!strkContext) {
        console.log('Skipping: Starknet devnet not available');
        return;
      }

      const username = 'account_info';
      const {sessionCookie, account} = await registerUser(username);

      const response = await TestApp.request(app).get('/api/account/me', {
        headers: {Cookie: sessionCookie},
      });

      expect(response.status).toBe(200);
      const body = await response.json() as AccountMeResponse;

      expect(body.id).toBe(account.id);
      expect(body.username).toBe(username);
      expect(body.status).toBe('pending');
      expect(body.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(body.deploymentTxHash).toBeUndefined();
      expect(body.createdAt).toBeDefined();
    });

    it('rejects unauthenticated request', async () => {
      const response = await TestApp.request(app).get('/api/account/me');

      expect(response.status).toBe(401);
    });

    it('rejects invalid session', async () => {
      const response = await TestApp.request(app).get('/api/account/me', {
        headers: {Cookie: 'session=invalid-session-id'},
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/account/deployment-status', () => {
    it('returns pending status for new account', async () => {
      if (!strkContext) {
        console.log('Skipping: Starknet devnet not available');
        return;
      }

      const username = 'status_pending';
      const {sessionCookie} = await registerUser(username);

      const response = await TestApp.request(app).get('/api/account/deployment-status', {
        headers: {Cookie: sessionCookie},
      });

      expect(response.status).toBe(200);
      const body = await response.json() as DeploymentStatusResponse;

      expect(body.status).toBe('pending');
      expect(body.txHash).toBeUndefined();
      expect(body.isDeployed).toBe(false);
    });

    it('rejects unauthenticated status request', async () => {
      const response = await TestApp.request(app).get('/api/account/deployment-status');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/account/deploy', () => {
    it('rejects unauthenticated deployment request', async () => {
      const response = await TestApp.request(app).post('/api/account/deploy', {});

      expect(response.status).toBe(401);
    });

    /**
     * NOTE: Full deployment testing is skipped because:
     * 1. WebAuthn accounts require a signature during deployment
     * 2. The VirtualAuthenticator creates the credential at registration time
     * 3. Deployment would need a separate WebAuthn signing flow (challenge/assertion)
     * 4. The DevnetPaymasterGateway cannot simulate this without additional infrastructure
     *
     * To test full deployment:
     * - Mock the PaymasterGateway to return success
     * - Or implement a test-specific deployment flow that bypasses WebAuthn signing
     */
    it.skip('deploys account to Starknet devnet (requires real paymaster)', async () => {
      // This test would require either:
      // 1. A mocked PaymasterGateway
      // 2. A real paymaster service
      // 3. Additional WebAuthn signing during deployment
    });
  });

  describe('Account State Transitions', () => {
    it('account starts in pending state after registration', async () => {
      if (!strkContext) {
        console.log('Skipping: Starknet devnet not available');
        return;
      }

      const username = 'state_test';
      const {sessionCookie, account} = await registerUser(username);

      // Verify account state from registration response
      expect(account.status).toBe('pending');
      expect(account.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Verify through API
      const meResponse = await TestApp.request(app).get('/api/account/me', {
        headers: {Cookie: sessionCookie},
      });
      const meBody = await meResponse.json() as AccountMeResponse;
      expect(meBody.status).toBe('pending');
    });

    it('account has computed Starknet address after registration', async () => {
      if (!strkContext) {
        console.log('Skipping: Starknet devnet not available');
        return;
      }

      const username = 'address_test';
      const {account} = await registerUser(username);

      // Starknet address should be computed at registration
      expect(account.starknetAddress).toBeDefined();
      expect(account.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Verify the address can be used to check deployment status (should be not deployed)
      const isDeployed = await strkContext.isAccountDeployed(
        await strkContext.calculateAccountAddress(account.starknetAddress!),
      );
      expect(isDeployed).toBe(false);
    });
  });
});
