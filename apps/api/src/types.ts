import {Account, Session,} from '@bim/domain';
import type {Hono} from 'hono';

/**
 * Application configuration loaded from environment variables.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  starknetRpcUrl: string;
  accountClassHash: string;
  wbtcTokenAddress: string;
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

  // WBTC token address on Starknet Sepolia (default for development/testing)
  const DEFAULT_WBTC_ADDRESS = '0x00abbd7d98ad664568f204d6e1af6e02d6a5c55eb4e83c9fbbfc3ed8514efc09';

  return {
    port: Number.parseInt(optional('PORT', '8080'), 10),
    nodeEnv: optional('NODE_ENV', 'development'),
    databaseUrl: required('DATABASE_URL'),
    starknetRpcUrl: required('STARKNET_RPC_URL'),
    accountClassHash: required('ACCOUNT_CLASS_HASH'),
    wbtcTokenAddress: optional('WBTC_TOKEN_ADDRESS', DEFAULT_WBTC_ADDRESS),
    avnuApiUrl: optional('AVNU_API_URL', 'https://starknet.api.avnu.fi'),
    avnuApiKey: optional('AVNU_API_KEY', ''),
    webauthnRpId: optional('WEBAUTHN_RP_ID', 'localhost'),
    webauthnRpName: optional('WEBAUTHN_RP_NAME', 'BIM'),
    webauthnOrigin: optional('WEBAUTHN_ORIGIN', 'http://localhost:8080'),
  };
}
