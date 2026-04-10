import {UuidCodec} from '@bim/lib/encoding';
import type {CredentialCreationOptions} from '@bim/test-toolkit/auth';
import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getSecretsPath, loadSecrets, saveSecrets} from '../config/secrets.js';

// =============================================================================
// E2E API configuration (from apps/api/.env.e2e-api-prod)
// =============================================================================

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_FILE = join(CLI_DIR, '..', 'api', '.env.e2e-api-prod');

interface Config {
  baseUrl: string;
  rpId: string;
  origin: string;
}

function loadConfig(): Config {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`Env file not found: ${ENV_FILE}`);
  }

  const env = Object.fromEntries(
    readFileSync(ENV_FILE, 'utf-8')
      .split('\n')
      .filter(line => line.includes('=') && !line.startsWith('#'))
      .map(line => {
        const eqIdx = line.indexOf('=');
        return [line.slice(0, eqIdx).trim(), line.slice(eqIdx + 1).trim()];
      }),
  );

  const origin = env.WEBAUTHN_ORIGIN;
  const rpId = env.WEBAUTHN_RP_ID;
  if (!origin || !rpId) {
    throw new Error('WEBAUTHN_ORIGIN and WEBAUTHN_RP_ID must be set in .env.e2e-api-prod');
  }

  return {baseUrl: origin, rpId, origin};
}

// =============================================================================
// API response types (minimal)
// =============================================================================

interface BeginRegistrationResponse {
  challengeId: string;
  accountId: string;
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
  };
}

interface DeployAccountResponse {
  txHash: string;
  status: string;
  starknetAddress: string;
}

interface DeploymentStatusResponse {
  status: string;
  txHash: string | undefined;
  isDeployed: boolean;
}

// =============================================================================
// HTTP helpers
// =============================================================================

function extractSessionCookie(response: Response): string {
  const cookies = response.headers.getSetCookie();
  for (const cookie of cookies) {
    const match = /session=([^;]+)/.exec(cookie);
    if (match) return `session=${match[1]}`;
  }
  return '';
}

// =============================================================================
// Account creation flow
// =============================================================================

async function createE2eAccount(
  config: Config,
  username: string,
): Promise<{username: string; starknetAddress: string; authenticator: WebauthnVirtualAuthenticator}> {
  const authenticator = new WebauthnVirtualAuthenticator();

  // Register
  console.log(`  Registering ${username}...`);
  const beginRes = await fetch(`${config.baseUrl}/api/auth/register/begin`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username}),
    signal: AbortSignal.timeout(30_000),
  });
  if (beginRes.status !== 200) throw new Error(`Register begin failed: ${await beginRes.text()}`);

  const beginBody = await beginRes.json() as BeginRegistrationResponse;
  const credOptions: CredentialCreationOptions = {
    challenge: beginBody.options.challenge,
    rp: {id: beginBody.options.rpId, name: beginBody.options.rpName},
    user: {
      id: UuidCodec.toBase64Url(beginBody.options.userId),
      name: beginBody.options.userName,
      displayName: beginBody.options.userName,
    },
    origin: config.origin,
  };
  const credential = await authenticator.createCredential(credOptions);

  const completeRes = await fetch(`${config.baseUrl}/api/auth/register/complete`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({challengeId: beginBody.challengeId, accountId: beginBody.accountId, username, credential}),
    signal: AbortSignal.timeout(30_000),
  });
  if (completeRes.status !== 200) throw new Error(`Register complete failed: ${await completeRes.text()}`);

  const sessionCookie = extractSessionCookie(completeRes);
  if (!sessionCookie) throw new Error('No session cookie after registration');

  // Deploy
  console.log(`  Deploying ${username}...`);
  const deployRes = await fetch(`${config.baseUrl}/api/account/deploy`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Cookie: sessionCookie},
    body: '{}',
    signal: AbortSignal.timeout(60_000),
  });
  if (deployRes.status !== 200) throw new Error(`Deploy failed: ${await deployRes.text()}`);

  const deployBody = await deployRes.json() as DeployAccountResponse;
  console.log(`  Deploy tx: ${deployBody.txHash}`);
  console.log(`  Starknet address: ${deployBody.starknetAddress}`);

  // Poll deployment status
  console.log(`  Waiting for deployment confirmation...`);
  for (let attempt = 0; attempt < 60; attempt++) {
    const statusRes = await fetch(`${config.baseUrl}/api/account/deployment-status`, {
      headers: {Cookie: sessionCookie},
      signal: AbortSignal.timeout(30_000),
    });
    if (statusRes.status !== 200) throw new Error(`Status check failed: ${await statusRes.text()}`);

    const status = await statusRes.json() as DeploymentStatusResponse;
    if (status.isDeployed) {
      console.log(`  Deployed!`);
      return {username, starknetAddress: deployBody.starknetAddress, authenticator};
    }
    if (status.status === 'failed') throw new Error(`Deployment failed on-chain (txHash: ${status.txHash})`);

    await new Promise(resolve => setTimeout(resolve, 5_000));
  }

  throw new Error('Deployment did not confirm after 300s');
}

// =============================================================================
// Main
// =============================================================================

export async function run(_args: string[]): Promise<void> {
  const secrets = loadSecrets();
  if (secrets.e2e) {
    console.error('E2E accounts already exist in .secrets.json.');
    console.error('Delete the "e2e" section to re-initialize.');
    process.exit(1);
  }

  const config = loadConfig();
  console.log(`Target: ${config.baseUrl}`);
  console.log(`RP ID:  ${config.rpId}\n`);

  // Health check
  const {checkApiHealth} = await import('../core');
  const health = await checkApiHealth(config.baseUrl);
  if (!health.healthy) throw new Error(`Server unhealthy at ${config.baseUrl}`);
  console.log('Server is healthy.\n');

  const timestamp = Date.now();

  console.log('Creating Account A...');
  const accountA = await createE2eAccount(config, `e2e_a_${timestamp}`);

  console.log('\nCreating Account B...');
  const accountB = await createE2eAccount(config, `e2e_b_${timestamp}`);

  saveSecrets({
    ...secrets,
    e2e: {
      accountA: {
        username: accountA.username,
        starknetAddress: accountA.starknetAddress,
        authenticator: accountA.authenticator.serialize(),
      },
      accountB: {
        username: accountB.username,
        starknetAddress: accountB.starknetAddress,
        authenticator: accountB.authenticator.serialize(),
      },
    },
  });

  console.log(`\nCredentials saved to: ${getSecretsPath()}`);
  console.log(`\n  A: ${accountA.username} -> ${accountA.starknetAddress}`);
  console.log(`  B: ${accountB.username} -> ${accountB.starknetAddress}`);
  console.log('\nNext: ./bim e2e:fund');
}
