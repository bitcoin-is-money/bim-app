import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import type {DeployAccountResponse, GetAccountResponse, GetDeploymentStatusResponse} from '../../../src/routes';
import {createTestLogger} from '../../helpers';
import {
  buildDeployReport,
  buildFailReport,
  E2eClient,
  formatAvnuCredits,
  getAvnuCredits,
  isServerHealthy,
  pollAvnuCreditsAfter,
  registerUser,
  sendSlackReport,
} from '../helpers';

/**
 * Scenario 01 — Create Account (E2E API prod)
 *
 * Calls the real production API via HTTP.
 * Creates a new BIM account with a unique username, then deploys it
 * via the AVNU paymaster (gasless).
 *
 * bail: 1 is set — any failure stops the entire suite.
 */
describe('Scenario 01 — Create Account', () => {
  const title = '01 — Create & Deploy Account';
  const startTime = Date.now();
  let endTime = 0;
  const rootLogger = createTestLogger();
  const log = rootLogger.child({name: '01-create-account.test.ts'});
  let client: E2eClient;
  let authenticator: WebauthnVirtualAuthenticator;
  let sessionCookie: string;
  let username: string;
  let starknetAddress: string;
  let deployTxHash: string;
  let reportSent = false;
  let lastError: unknown;
  let avnuCreditsBefore: bigint | undefined;

  beforeAll(async () => {
    // Capture any throw from setup itself — afterEach only fires for it()
    // blocks, so without this wrapper errors thrown here would reach afterAll
    // with lastError still undefined and the fail report would say
    // "(no error captured ...)".
    try {
      client = new E2eClient();
      authenticator = new WebauthnVirtualAuthenticator();
      avnuCreditsBefore = await getAvnuCredits();
    } catch (err) {
      if (lastError === undefined) lastError = err;
      throw err;
    }
  });

  afterEach((testCtx) => {
    if (testCtx.task.result?.state === 'fail' && lastError === undefined) {
      lastError = testCtx.task.result.errors?.[0];
    }
  });

  afterAll(async () => {
    if (!reportSent) {
      const report = buildFailReport({
        title,
        durationSeconds: Math.round((Date.now() - startTime) / 1_000),
        error: lastError,
      });
      log.error('\n' + report);
      await sendSlackReport(log, report);
    }
  });

  it('pre-check: server is healthy', async () => {
    expect(await isServerHealthy(client)).toBe(true);
  });

  it('registers a new account', async () => {
    username = `e2e_tmp_${Date.now()}`;
    log.info({username}, 'Registering account');

    const result = await registerUser(client, authenticator, username);

    sessionCookie = result.sessionCookie;

    expect(result.account.status).toBe('pending');
    expect(result.account.username).toBe(username);
    expect(result.account.starknetAddress).toBeNull();
    log.info({username, status: result.account.status}, 'Account registered');
  });

  it('retrieves the pending account via API', async () => {
    const response = await client.get('/api/account/me', {
      headers: {Cookie: sessionCookie},
    });

    expect(response.status).toBe(200);
    const body = await response.json() as GetAccountResponse;
    expect(body.status).toBe('pending');
    expect(body.starknetAddress).toBeNull();
    expect(body.deploymentTxHash).toBeNull();
  });

  it('deploys the account via AVNU paymaster', async () => {
    const deployResponse = await client.post(
      '/api/account/deploy',
      {},
      {headers: {Cookie: sessionCookie}},
    );

    if (deployResponse.status !== 200) {
      const errorBody = await deployResponse.text();
      throw new Error(`Deployment failed (HTTP ${deployResponse.status}): ${errorBody}`);
    }

    const body = await deployResponse.json() as DeployAccountResponse;

    expect(body.starknetAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(body.txHash).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(body.status).toBe('deploying');

    starknetAddress = body.starknetAddress;
    deployTxHash = body.txHash;
    log.info({starknetAddress, txHash: deployTxHash}, 'Deployment submitted');
  });

  it('confirms deployment via polling', async () => {
    const maxAttempts = 60;
    const intervalMs = 3_000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await client.get('/api/account/deployment-status', {
        headers: {Cookie: sessionCookie},
      });

      expect(response.status).toBe(200);
      const body = await response.json() as GetDeploymentStatusResponse;

      if (body.isDeployed) {
        endTime = Date.now();
        expect(body.status).toBe('deployed');
        expect(body.txHash).toMatch(/^0x[0-9a-fA-F]+$/);
        log.info({txHash: body.txHash, elapsedSeconds: attempt * intervalMs / 1_000}, 'Deployment confirmed');
        return;
      }

      if (body.status === 'failed') {
        throw new Error(`Deployment failed on-chain (txHash: ${body.txHash})`);
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Deployment did not confirm after ${maxAttempts * intervalMs / 1_000}s`);
  });

  it('verifies deployed account via API', async () => {
    const response = await client.get('/api/account/me', {
      headers: {Cookie: sessionCookie},
    });

    expect(response.status).toBe(200);
    const body = await response.json() as GetAccountResponse;
    expect(body.status).toBe('deployed');
    expect(body.starknetAddress).toBe(starknetAddress);
    expect(body.deploymentTxHash).toBeDefined();
    log.info({starknetAddress: body.starknetAddress, status: body.status}, 'Account fully deployed');
  });

  it('report', async () => { // NOSONAR
    const avnuCreditsAfter = await pollAvnuCreditsAfter(getAvnuCredits, avnuCreditsBefore, log);
    const report = buildDeployReport({
      title: '01 — Create & Deploy Account',
      status: 'PASS',
      username,
      starknetAddress,
      txHash: deployTxHash,
      durationSeconds: Math.round((endTime - startTime) / 1_000),
      avnuCreditsBefore: formatAvnuCredits(avnuCreditsBefore),
      avnuCreditsAfter: formatAvnuCredits(avnuCreditsAfter),
    });
    console.log('\n' + report);
    await sendSlackReport(log, report);
    reportSent = true;
  });
});
