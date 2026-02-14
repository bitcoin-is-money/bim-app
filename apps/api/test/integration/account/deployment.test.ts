import * as schema from '@bim/db';
import {StarknetAddress} from '@bim/domain/account';
import {WebauthnVirtualAuthenticator} from "@bim/test-toolkit/auth";
import {eq} from 'drizzle-orm';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {ApiErrorResponse} from '../../../src/errors';
import type {DeployAccountResponse, GetAccountResponse, GetDeploymentStatusResponse} from '../../../src/routes';
import {registerUser} from '../../helpers';
import {type DbClient, DevnetPaymasterGateway, StrkDevnetContext, TestApp, TestDatabase,} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

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
  let authenticator: WebauthnVirtualAuthenticator;
  let strkContext: StrkDevnetContext;
  let paymasterGateway: DevnetPaymasterGateway;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;

  beforeAll(async () => {
    strkContext = StrkDevnetContext.create();
    // Initialize StarkSigner with a devnet account's private key
    await strkContext.ensureStarkSignerInitialized();
    // Use P256Signer for WebAuthn credential creation
    authenticator = new WebauthnVirtualAuthenticator({signer: strkContext.getP256Signer()});
    // Get reference to paymaster gateway for verifying the deployed address
    paymasterGateway = strkContext.getDevnetPaymasterGateway();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);
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

  function register(username: string) {
    return registerUser(TestApp.request(app), authenticator, username);
  }

  describe('GET /api/account/me', () => {
    it('returns account info for authenticated user', async () => {
      const username = 'account_info';
      const {sessionCookie, account} = await register(username);

      // Verify account state from registration response
      expect(account.status).toBe('pending');
      // Starknet address is null until deployment
      expect(account.starknetAddress).toBeNull();

      const response = await TestApp
        .request(app)
        .get('/api/account/me', {
          headers: {Cookie: sessionCookie},
        });

      expect(response.status).toBe(200);
      const body = await response.json() as GetAccountResponse;

      expect(body.id).toBe(account.id);
      expect(body.username).toBe(username);
      expect(body.status).toBe('pending');
      expect(body.starknetAddress).toBeNull();
      expect(body.deploymentTxHash).toBeNull();
      expect(body.createdAt).toBeDefined();
    });

    it('rejects unauthenticated request', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/account/me');

      expect(response.status).toBe(401);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid session', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/account/me', {
          headers: {Cookie: 'session=invalid-session-id'},
        });

      expect(response.status).toBe(401);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('GET /api/account/deployment-status', () => {
    it('returns pending status for new account', async () => {
      const username = 'status_pending';
      const {sessionCookie} = await register(username);
      const response = await TestApp
        .request(app)
        .get('/api/account/deployment-status', {
          headers: {Cookie: sessionCookie},
        });

      expect(response.status).toBe(200);
      const body = await response.json() as GetDeploymentStatusResponse;

      expect(body.status).toBe('pending');
      expect(body.txHash).toBeNull();
      expect(body.isDeployed).toBe(false);
    });

    it('rejects unauthenticated status request', async () => {
      const response = await TestApp
        .request(app)
        .get('/api/account/deployment-status');

      expect(response.status).toBe(401);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/account/deploy', () => {
    it('rejects unauthenticated deployment request', async () => {
      const response = await TestApp
        .request(app)
        .post('/api/account/deploy', {});

      expect(response.status).toBe(401);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects deployment for already deployed account', async () => {
      const publicKey = strkContext.generateTestPublicKey();
      const starknetGateway = strkContext.getStarknetGateway();
      const starknetAddress = await starknetGateway.calculateAccountAddress({publicKey});

      const account = await accountFixture.insertAccount({
        username: 'already_deployed_user',
        publicKey,
        starknetAddress: starknetAddress.toString(),
        status: 'deployed',
      });
      const session = await authFixture.insertSession(account.id);

      const response = await TestApp
        .request(app)
        .post('/api/account/deploy', {}, {
          headers: {Cookie: `session=${session.id}`},
        });

      expect(response.status).toBe(400);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('INVALID_ACCOUNT_STATE');
    });

    it('deploys account to Starknet devnet', async () => {
      const username = 'deploy_test';
      const {sessionCookie, account} = await register(username);

      // Verify the account is pending before deployment (no starknet address yet)
      expect(account.status).toBe('pending');
      expect(account.starknetAddress).toBeNull();

      // Trigger deployment
      const deployResponse = await TestApp
        .request(app)
        .post('/api/account/deploy', {}, {
          headers: {Cookie: sessionCookie},
        });

      expect(deployResponse.status).toBe(200);
      const deployBody = await deployResponse.json() as DeployAccountResponse;

      // Starknet address should now be computed
      expect(deployBody.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);

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
      const statusBody = await statusResponse.json() as GetDeploymentStatusResponse;
      expect(statusBody.status).toBe('deployed');
      expect(statusBody.isDeployed).toBe(true);
      expect(statusBody.txHash).toBe(deployBody.txHash);
    });
  });

  describe('Account State Transitions', () => {

    it('account has no Starknet address after registration', async () => {
      const username = 'address_test';
      const {account} = await register(username);

      // Starknet address should NOT be computed at registration
      expect(account.starknetAddress).toBeNull();
      expect(account.status).toBe('pending');
    });

    // NOTE: The test "deploys account to Starknet devnet" above already verifies
    // that starknetAddress is computed and returned during deployment.
    // We can't run multiple deployment tests with the same P256 signer because
    // they would all compute the same Starknet address, and the devnet would
    // reject deploying the same address twice.
  });
});
