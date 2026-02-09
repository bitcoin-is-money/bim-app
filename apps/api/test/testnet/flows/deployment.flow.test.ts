import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import {eq} from 'drizzle-orm';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import * as schema from '../../../src/db/schema';
import type {ApiErrorResponse} from '../../../src/errors';
import type {
  DeployAccountResponse,
  GetAccountResponse,
  GetDeploymentStatusResponse
} from "../../../src/routes";
import {registerUser} from '../../helpers';
import {type DbClient, TestDatabase, TestnetApp, TestnetContext} from '../helpers';

/**
 * Account Deployment Flow — Testnet (Starknet Sepolia)
 *
 * THE critical testnet test. Validates the full production deployment flow:
 * 1. WebAuthn registration (P256 key pair via VirtualAuthenticator)
 * 2. Account deployment via real AVNU paymaster (gasless, on Sepolia)
 * 3. On-chain verification (BIM Argent 0.5.0 contract deployed at computed address)
 *
 * Unlike devnet tests which use DevnetPaymasterGateway (STARK signatures, OZ account),
 * these tests use the real AvnuPaymasterGateway with P256/WebAuthn signatures —
 * exactly what production does.
 */
describe('Deployment Flow (Testnet)', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let authenticator: WebauthnVirtualAuthenticator;
  let testnetContext: TestnetContext;

  beforeAll(() => {
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    authenticator = new WebauthnVirtualAuthenticator();
    testnetContext = new TestnetContext();
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

  describe('GET /api/account/me', () => {
    it('returns pending account before deployment', async () => {
      const {sessionCookie, account} = await register('tn_deploy_info');

      expect(account.status).toBe('pending');
      expect(account.starknetAddress).toBeNull();

      const response = await TestnetApp
        .request(app)
        .get('/api/account/me', {headers: {Cookie: sessionCookie}});

      expect(response.status).toBe(200);
      const body = await response.json() as GetAccountResponse;
      expect(body.status).toBe('pending');
      expect(body.starknetAddress).toBeNull();
      expect(body.deploymentTxHash).toBeNull();
    });
  });

  describe('POST /api/account/deploy', () => {
    it('deploys account to Starknet Sepolia via AVNU paymaster', async () => {
      const username = 'tn_deploy_test';
      const {sessionCookie, account} = await register(username);

      // Account starts as pending with no Starknet address
      expect(account.status).toBe('pending');
      expect(account.starknetAddress).toBeNull();

      // Trigger deployment (returns immediately with status 'deploying')
      const deployResponse = await TestnetApp
        .request(app)
        .post('/api/account/deploy', {}, {headers: {Cookie: sessionCookie}});

      if (deployResponse.status !== 200) {
        const errorBody = await deployResponse.text();
        throw new Error(
          `Deployment failed (HTTP ${deployResponse.status}).\n` +
          `Response: ${errorBody}`,
        );
      }

      const deployBody = await deployResponse.json() as DeployAccountResponse;

      // Starknet address should now be computed from a P256 public key
      expect(deployBody.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);

      if (!deployBody.txHash) {
        throw new Error(
          `Deployment returned starknetAddress=${deployBody.starknetAddress} but no txHash.`,
        );
      }

      expect(deployBody.txHash).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(deployBody.status).toBe('deploying');

      // Wait for Sepolia confirmation (can take 15-60s)
      await testnetContext.waitForTransaction(deployBody.txHash);

      // Give the async confirmation handler time to update the DB
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify DB status is now 'deployed'
      const dbAccount = await db
        .select({
          status: schema.accounts.status,
          deploymentTxHash: schema.accounts.deploymentTxHash,
          starknetAddress: schema.accounts.starknetAddress,
        })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, account.id))
        .then((rows: Array<{
          status: string | null;
          deploymentTxHash: string | null;
          starknetAddress: string | null
        }>) => rows[0]);

      expect(dbAccount?.status).toBe('deployed');
      expect(dbAccount?.deploymentTxHash).toBe(deployBody.txHash);
      expect(dbAccount?.starknetAddress).toBe(deployBody.starknetAddress);

      // Verify on-chain: the contract is actually deployed on Sepolia
      const isDeployed = await testnetContext.isAccountDeployed(deployBody.starknetAddress);
      expect(isDeployed).toBe(true);

      // Verify the deployed class hash matches BIM Argent 0.5.0
      const classHash = await testnetContext.getClassHashAt(deployBody.starknetAddress);
      expect(BigInt(classHash ?? 0)).toBe(BigInt(testnetContext.getBimClassHash()));

      // Verify via API endpoints
      const meResponse = await TestnetApp
        .request(app)
        .get('/api/account/me', {headers: {Cookie: sessionCookie}});
      const meBody = await meResponse.json() as GetAccountResponse;
      expect(meBody.status).toBe('deployed');
      expect(meBody.starknetAddress).toBe(deployBody.starknetAddress);
      expect(meBody.deploymentTxHash).toBe(deployBody.txHash);

      const statusResponse = await TestnetApp
        .request(app)
        .get('/api/account/deployment-status', {headers: {Cookie: sessionCookie}});
      const statusBody = await statusResponse.json() as GetDeploymentStatusResponse;
      expect(statusBody.status).toBe('deployed');
      expect(statusBody.isDeployed).toBe(true);
      expect(statusBody.txHash).toBe(deployBody.txHash);
    });

    it('rejects unauthenticated deployment request', async () => {
      const response = await TestnetApp
        .request(app)
        .post('/api/account/deploy', {});

      expect(response.status).toBe(401);
      const body = await response.json() as ApiErrorResponse;
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
