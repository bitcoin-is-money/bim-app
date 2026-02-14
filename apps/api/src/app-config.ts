import {redactUrl} from '@bim/lib/url';
import type {DatabaseConfig, DatabaseSslMode} from './db';

export namespace AppConfig {

  export interface Config {
    port: number;
    nodeEnv: string;
    starknetNetwork: 'mainnet' | 'testnet' | 'devnet';
    database: DatabaseConfig;
    starknetRpcUrl: string;
    accountClassHash: string;
    wbtcTokenAddress: string;
    avnuApiUrl: string;
    avnuApiKey: string;
    feeTreasuryAddress: string;
    atomiqStoragePath: string;
    webauthnRpId: string;
    webauthnRpName: string;
    webauthnOrigin: string;
    logLevel: string;
  }

  /**
   * Loads configuration from environment variables.
   */
  export function load(): Config {
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

    const starknetNetwork = optional('STARKNET_NETWORK', 'testnet') as 'mainnet' | 'testnet' | 'devnet';
    if (!['mainnet', 'testnet', 'devnet'].includes(starknetNetwork)) {
      throw new Error(`Invalid STARKNET_NETWORK: ${starknetNetwork}. Must be 'mainnet', 'testnet', or 'devnet'.`);
    }

    return {
      port: Number.parseInt(optional('PORT', '8080'), 10),
      nodeEnv: optional('NODE_ENV', 'development'),
      starknetNetwork: starknetNetwork,
      database: {
        url: required('DATABASE_URL'),
        sslMode: parseSslMode(optional('DATABASE_SSL', 'strict')),
      },
      starknetRpcUrl: required('STARKNET_RPC_URL'),
      accountClassHash: required('ACCOUNT_CLASS_HASH'),
      wbtcTokenAddress: optional('WBTC_TOKEN_ADDRESS', DEFAULT_WBTC_ADDRESS),
      avnuApiUrl: optional('AVNU_API_URL', 'https://starknet.paymaster.avnu.fi'),
      avnuApiKey: optional('AVNU_API_KEY', ''),
      atomiqStoragePath: required('ATOMIQ_STORAGE_PATH'),
      feeTreasuryAddress: required('FEE_TREASURY_ADDRESS'),
      webauthnRpId: optional('WEBAUTHN_RP_ID', 'localhost'),
      webauthnRpName: optional('WEBAUTHN_RP_NAME', 'BIM'),
      webauthnOrigin: optional('WEBAUTHN_ORIGIN', 'http://localhost:8080'),
      logLevel: optional('LOG_LEVEL', 'debug'),
    };
  }

  function parseSslMode(value: string): DatabaseSslMode {
    const valid: DatabaseSslMode[] = ['off', 'allow-self-signed', 'strict'];
    if (!valid.includes(value as DatabaseSslMode)) {
      throw new Error(`Invalid DATABASE_SSL: "${value}". Must be one of: ${valid.join(', ')}.`);
    }
    return value as DatabaseSslMode;
  }

  /**
   * Returns a copy of the config with sensitive values redacted, suitable for logging.
   */
  export function redact(config: Config): Record<string, unknown> {
    return {
      ...config,
      database: {
        ...config.database,
        url: redactUrl(config.database.url),
      },
      starknetRpcUrl: redactUrl(config.starknetRpcUrl),
      avnuApiKey: config.avnuApiKey ? '***' : '',
    };
  }
}
