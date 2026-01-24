import {StarknetAddress} from '@bim/domain';
import {eq} from 'drizzle-orm';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import * as schema from '../../../database/schema';
import {
  type CredentialCreationOptions,
  type DbClient,
  DEVNET_ACCOUNT_CLASS_HASH,
  DevnetPaymasterGateway,
  StrkDevnetContext,
  TestApp,
  TestDatabase,
  VirtualAuthenticator,
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
 * NOTE: Full deployment tests require a real paymaster or a mocked infrastructure
 * because WebAuthn accounts need signature from the credential during deployment.
 * The tests here focus on API behavior that doesn't require actual chain deployment.
 */
describe('Account Deployment Flow', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let authenticator: VirtualAuthenticator;
  let strkContext: StrkDevnetContext;
  let paymasterGateway: DevnetPaymasterGateway;

  beforeAll(async () => {
    strkContext = StrkDevnetContext.create();
    // Initialize StarkSigner with a devnet account's private key
    await strkContext.ensureStarkSignerInitialized();
    // Use P256Signer for WebAuthn credential creation
    authenticator = new VirtualAuthenticator({signer: strkContext.getP256Signer()});
    // Get reference to paymaster gateway for verifying the deployed address
    paymasterGateway = strkContext.getDevnetPaymasterGateway();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    app = TestApp.createTestApp({
      context: {
        gateways: {
          starknet: strkContext.getStarknetGateway(),
          paymaster: paymasterGateway,
        },
      },
    });
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
   * Helper to register a user, return session cookie and account info.
   */
  async function registerUser(username: string): Promise<{
    sessionCookie: string;
    account: RegistrationCompleteResponse['account'];
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
      const username = 'account_info';
      const {sessionCookie, account} = await registerUser(username);

      // Verify account state from registration response
      expect(account.status).toBe('pending');
      expect(account.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);

      const response = await TestApp
        .request(app)
        .get('/api/account/me', {
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
      const response = await TestApp
        .request(app)
        .get('/api/account/me');

      expect(response.status).toBe(401);
    });

    it('rejects invalid session', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/account/me', {
          headers: {Cookie: 'session=invalid-session-id'},
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/account/deployment-status', () => {
    it('returns pending status for new account', async () => {
      const username = 'status_pending';
      const {sessionCookie} = await registerUser(username);
      const response = await TestApp
        .request(app)
        .get('/api/account/deployment-status', {
          headers: {Cookie: sessionCookie},
        });

      expect(response.status).toBe(200);
      const body = await response.json() as DeploymentStatusResponse;

      expect(body.status).toBe('pending');
      expect(body.txHash).toBeUndefined();
      expect(body.isDeployed).toBe(false);
    });

    it('rejects unauthenticated status request', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/account/deployment-status');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/account/deploy', () => {
    it('rejects unauthenticated deployment request', async () => {
      const response = await TestApp
        .request(app)
        .post('/api/account/deploy', {});

      expect(response.status).toBe(401);
    });

    it('deploys account to Starknet devnet', async () => {
      const username = 'deploy_test';
      const {sessionCookie, account} = await registerUser(username);

      // Verify the account is pending before deployment
      expect(account.status).toBe('pending');
      expect(account.starknetAddress).toBeDefined();

      // Trigger deployment
      const deployResponse = await TestApp
        .request(app)
        .post('/api/account/deploy', {}, {
          headers: {Cookie: sessionCookie},
        });

      expect(deployResponse.status).toBe(200);
      const deployBody = await deployResponse.json() as {
        txHash: string;
        status: string;
      };

      expect(deployBody.txHash).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(deployBody.status).toBe('deploying');

      // Wait for deployment confirmation
      await strkContext.waitForTransaction(deployBody.txHash);

      // Give the async confirmation handler time to update the DB
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify account status in DB is now 'deployed'
      const dbAccount = await db
        .select({
          status: schema.accounts.status,
          deploymentTxHash: schema.accounts.deploymentTxHash,
        })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, account.id))
        .then(rows => rows[0]);

      expect(dbAccount?.status).toBe('deployed');
      expect(dbAccount?.deploymentTxHash).toBe(deployBody.txHash);

      // Verify on-chain: the account is actually deployed
      // NOTE: On devnet, we deploy at a STARK-based address (not P256-based)
      // because devnet uses OpenZeppelin account which expects STARK signatures.
      // In production, the WebAuthn contract would accept P256 signatures at
      // the P256-based address. This test verifies deployment mechanics work.
      const deployedAddress = paymasterGateway.getLastDeployedAddress();
      expect(deployedAddress).toBeDefined();
      const starknetAddress = StarknetAddress.of(deployedAddress!);
      const isDeployed = await strkContext.isAccountDeployed(starknetAddress);
      expect(isDeployed).toBe(true);

      // Verify via API endpoint
      const statusResponse = await TestApp
        .request(app)
        .get('/api/account/deployment-status', {
          headers: {Cookie: sessionCookie},
        });

      expect(statusResponse.status).toBe(200);
      const statusBody = await statusResponse.json() as DeploymentStatusResponse;
      expect(statusBody.status).toBe('deployed');
      expect(statusBody.isDeployed).toBe(true);
      expect(statusBody.txHash).toBe(deployBody.txHash);
    });
  });

  describe('Account State Transitions', () => {

    it('account has computed Starknet address after registration', async () => {
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
