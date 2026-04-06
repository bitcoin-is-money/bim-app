import type {SerializedAuthenticator} from '@bim/test-toolkit/auth';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// =============================================================================
// Path
// =============================================================================

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SECRETS_PATH = join(CLI_DIR, '.secrets.json');

export function getSecretsPath(): string {
  return SECRETS_PATH;
}

// =============================================================================
// Section types
// =============================================================================

export interface StarknetAccountSecrets {
  readonly privateKey: string;
  readonly publicKey: string;
  readonly address: string;
  readonly classHash: string;
}

export interface AvnuSecrets {
  readonly contractEntryPoint: string;
  readonly connectedWallet: string;
  readonly publicIdHash: string;
  readonly apiKey: string;
}

export interface SlackSecrets {
  readonly botToken: string;
}

export interface E2eAccountSecrets {
  readonly username: string;
  readonly starknetAddress: string;
  readonly authenticator: SerializedAuthenticator;
}

export interface E2eSecrets {
  accountA: E2eAccountSecrets;
  accountB: E2eAccountSecrets;
}

export interface Secrets {
  treasury?: {
    testnet?: StarknetAccountSecrets;
    mainnet?: StarknetAccountSecrets;
  };
  deployer?: StarknetAccountSecrets;
  avnu?: AvnuSecrets;
  slack?: SlackSecrets;
  e2e?: E2eSecrets;
}

// =============================================================================
// Load / Save
// =============================================================================

export function loadSecrets(): Secrets {
  if (!existsSync(SECRETS_PATH)) {
    return {};
  }
  return JSON.parse(readFileSync(SECRETS_PATH, 'utf-8')) as Secrets;
}

export function saveSecrets(secrets: Secrets): void {
  writeFileSync(SECRETS_PATH, JSON.stringify(secrets, undefined, 2) + '\n');
}

export function secretsExist(): boolean {
  return existsSync(SECRETS_PATH);
}

// =============================================================================
// Typed accessors
// =============================================================================

export function requireTreasury(
  secrets: Secrets,
  network: 'testnet' | 'mainnet',
): StarknetAccountSecrets {
  const account = secrets.treasury?.[network];
  if (!account) {
    throw new Error(
      `No treasury.${network} in .secrets.json.\n` +
      `Run: ./bim treasury:create ${network}`,
    );
  }
  return account;
}

export function requireDeployer(secrets: Secrets): StarknetAccountSecrets {
  if (!secrets.deployer) {
    throw new Error(
      'No deployer in .secrets.json.\nRun: ./bim deployer:create',
    );
  }
  return secrets.deployer;
}

export function requireAvnu(secrets: Secrets): AvnuSecrets {
  if (!secrets.avnu) {
    throw new Error(
      'No avnu in .secrets.json.\n' +
      'Add manually: { "avnu": { "contractEntryPoint": "0x...", "publicIdHash": "0x...", ... } }',
    );
  }
  return secrets.avnu;
}

export function requireSlack(secrets: Secrets): SlackSecrets {
  if (!secrets.slack) {
    throw new Error(
      'No slack in .secrets.json.\n' +
      'Add manually: { "slack": { "botToken": "xoxb-...", "channel": "#channel" } }',
    );
  }
  return secrets.slack;
}

export function requireE2e(secrets: Secrets): E2eSecrets {
  if (!secrets.e2e) {
    throw new Error(
      'No e2e in .secrets.json.\nRun: ./bim e2e:init',
    );
  }
  return secrets.e2e;
}
