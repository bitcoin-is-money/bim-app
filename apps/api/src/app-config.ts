import {accessSync, constants, mkdirSync} from 'node:fs';
import {redactUrl} from '@bim/lib/url';
import type {DatabaseConfig, DatabaseSslMode} from './db';

export type AuthenticatorAttachment = 'platform' | 'cross-platform';

export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  origin: string;
  authenticatorAttachment?: AuthenticatorAttachment;
}

export interface AtomiqConfig {
  storagePath: string;
  createIfNotExists: boolean;
}

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
    atomiq: AtomiqConfig;
    webauthn: WebAuthnConfig;
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
      wbtcTokenAddress: required('WBTC_TOKEN_ADDRESS'),
      avnuApiUrl: optional('AVNU_API_URL', 'https://starknet.paymaster.avnu.fi'),
      avnuApiKey: optional('AVNU_API_KEY', ''),
      atomiq: loadAtomiqConfig(required, optional),
      feeTreasuryAddress: required('FEE_TREASURY_ADDRESS'),
      webauthn: {
        rpId: optional('WEBAUTHN_RP_ID', 'localhost'),
        rpName: optional('WEBAUTHN_RP_NAME', 'BIM'),
        origin: optional('WEBAUTHN_ORIGIN', 'http://localhost:8080'),
        authenticatorAttachment: parseAuthenticatorAttachment(process.env.WEBAUTHN_AUTHENTICATOR_ATTACHMENT),
      },
      logLevel: optional('LOG_LEVEL', 'debug'),
    };
  }

  function loadAtomiqConfig(
    required: (name: string) => string,
    optional: (name: string, defaultValue: string) => string,
  ): AtomiqConfig {
    const storagePath = required('ATOMIQ_STORAGE_PATH');
    const createIfNotExists = optional('ATOMIQ_AUTO_CREATE_STORAGE', 'false') === 'true';

    let exists = false;
    try {
      accessSync(storagePath, constants.F_OK);
      exists = true;
    } catch {
      // Directory does not exist
    }

    if (!exists) {
      if (!createIfNotExists) {
        throw new Error(`ATOMIQ_STORAGE_PATH does not exist: ${storagePath}. Set ATOMIQ_AUTO_CREATE_STORAGE=true to create it automatically.`);
      }
      mkdirSync(storagePath, {recursive: true});
    }

    try {
      accessSync(storagePath, constants.R_OK | constants.W_OK);
    } catch {
      throw new Error(`ATOMIQ_STORAGE_PATH is not writable: ${storagePath}`);
    }

    return {storagePath, createIfNotExists};
  }

  function parseAuthenticatorAttachment(value: string | undefined): AuthenticatorAttachment | undefined {
    if (!value) return undefined;
    const valid: AuthenticatorAttachment[] = ['platform', 'cross-platform'];
    if (!valid.includes(value as AuthenticatorAttachment)) {
      throw new Error(`Invalid WEBAUTHN_AUTHENTICATOR_ATTACHMENT: "${value}". Must be one of: ${valid.join(', ')}.`);
    }
    return value as AuthenticatorAttachment;
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
