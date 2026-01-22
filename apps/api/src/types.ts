import {
  Account,
  type AccountRepository,
  type AtomiqGateway,
  type ChallengeRepository,
  type PaymasterGateway,
  Session,
  type SessionRepository,
  type StarknetGateway,
  type SwapRepository,
  type TransactionRepository,
  type UserSettingsRepository,
  type WatchedAddressRepository,
  type WebAuthnGateway,
} from '@bim/domain';
import {type DeepPartial} from '@bim/lib';
import type {Hono} from 'hono';

export type {DeepPartial};


/**
 * Application configuration loaded from environment variables.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  starknetRpcUrl: string;
  accountClassHash: string;
  avnuApiUrl: string;
  avnuApiKey: string;
  webauthnRpId: string;
  webauthnRpName: string;
  webauthnOrigin: string;
}

export type AuthenticatedContext = {
  session: Session;
  account: Account;
};

export type AuthenticatedHono = Hono<{
  Variables: AuthenticatedContext;
}>;

/**
 * Loads configuration from environment variables.
 */
export function loadConfig(): AppConfig {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  };

  const optional = (name: string, defaultValue: string): string => {
    return process.env[name] || defaultValue;
  };

  return {
    port: Number.parseInt(optional('PORT', '8080'), 10),
    nodeEnv: optional('NODE_ENV', 'development'),
    databaseUrl: required('DATABASE_URL'),
    starknetRpcUrl: required('STARKNET_RPC_URL'),
    accountClassHash: required('ACCOUNT_CLASS_HASH'),
    avnuApiUrl: optional('AVNU_API_URL', 'https://starknet.api.avnu.fi'),
    avnuApiKey: optional('AVNU_API_KEY', ''),
    webauthnRpId: optional('WEBAUTHN_RP_ID', 'localhost'),
    webauthnRpName: optional('WEBAUTHN_RP_NAME', 'BIM'),
    webauthnOrigin: optional('WEBAUTHN_ORIGIN', 'http://localhost:8080'),
  };
}
