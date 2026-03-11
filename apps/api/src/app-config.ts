import {accessSync, constants, mkdirSync} from 'node:fs';
import * as schema from '@bim/db';
import {redactUrl} from '@bim/lib/url';
import type {DatabaseConfig} from '@bim/db/database';
import {getTableName} from 'drizzle-orm';
import type {AtomiqGatewayConfig, AuthenticatorAttachment, WebAuthnConfig} from './adapters';

export namespace AppConfig {

  export interface Config {
    appVersion: string;
    port: number;
    nodeEnv: string;
    starknetNetwork: 'mainnet' | 'testnet' | 'devnet';
    database: Partial<DatabaseConfig>;
    starknetRpcUrl: string;
    accountClassHash: string;
    wbtcTokenAddress: string;
    avnuApiUrl: string;
    avnuApiKey: string;
    avnuSwapApiUrl: string;
    feeTreasuryAddress: string;
    atomiq: AtomiqGatewayConfig;
    webauthn: WebAuthnConfig;
    logLevel: string;
  }

  /**
   * Loads configuration from environment variables.
   */
  export function load(): Config {
    const required = (name: string): string => {
      // eslint-disable-next-line security/detect-object-injection -- env var lookup by name
      const value = process.env[name];
      if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
      }
      return value;
    };

    const optional = (name: string, defaultValue: string): string => {
      // eslint-disable-next-line security/detect-object-injection, @typescript-eslint/prefer-nullish-coalescing -- env var lookup; empty env var should use default
      return process.env[name] || defaultValue;
    };

    const starknetNetwork = optional('STARKNET_NETWORK', 'testnet') as 'mainnet' | 'testnet' | 'devnet';
    if (!['mainnet', 'testnet', 'devnet'].includes(starknetNetwork)) {
      throw new Error(`Invalid STARKNET_NETWORK: ${starknetNetwork}. Must be 'mainnet', 'testnet', or 'devnet'.`);
    }

    const starknetRpcUrl = required('STARKNET_RPC_URL');
    const authenticatorAttachment = parseAuthenticatorAttachment(process.env.WEBAUTHN_AUTHENTICATOR_ATTACHMENT);

    return {
      appVersion: optional('APP_VERSION', 'dev'),
      port: Number.parseInt(optional('PORT', '8080'), 10),
      nodeEnv: optional('NODE_ENV', 'development'),
      starknetNetwork: starknetNetwork,
      database: {
        url: required('DATABASE_URL'),
        startupRequiredTable: schema.accounts,
      },
      starknetRpcUrl,
      accountClassHash: required('ACCOUNT_CLASS_HASH'),
      wbtcTokenAddress: required('WBTC_TOKEN_ADDRESS'),
      avnuApiUrl: optional('AVNU_API_URL', 'https://starknet.paymaster.avnu.fi'),
      avnuApiKey: optional('AVNU_API_KEY', ''),
      avnuSwapApiUrl: optional('AVNU_SWAP_API_URL',
        starknetNetwork === 'mainnet'
          ? 'https://starknet.api.avnu.fi'
          : 'https://sepolia.api.avnu.fi'),
      atomiq: loadAtomiqConfig(required, optional, starknetNetwork, starknetRpcUrl),
      feeTreasuryAddress: required('FEE_TREASURY_ADDRESS'),
      webauthn: {
        rpId: optional('WEBAUTHN_RP_ID', 'localhost'),
        rpName: optional('WEBAUTHN_RP_NAME', 'BIM'),
        origin: optional('WEBAUTHN_ORIGIN', 'http://localhost:8080'),
        ...(authenticatorAttachment !== undefined && {authenticatorAttachment}),
      },
      logLevel: optional('LOG_LEVEL', 'debug'),
    };
  }

  function loadAtomiqConfig(
    required: (name: string) => string,
    optional: (name: string, defaultValue: string) => string,
    starknetNetwork: 'mainnet' | 'testnet' | 'devnet',
    starknetRpcUrl: string,
  ): AtomiqGatewayConfig {
    const storagePath = required('ATOMIQ_STORAGE_PATH');
    const autoCreateStorage = optional('ATOMIQ_AUTO_CREATE_STORAGE', 'false') === 'true';

    let exists = false;
    try {
      accessSync(storagePath, constants.F_OK);
      exists = true;
    } catch {
      // Directory does not exist
    }

    if (!exists) {
      if (!autoCreateStorage) {
        throw new Error(`ATOMIQ_STORAGE_PATH does not exist: ${storagePath}. Set ATOMIQ_AUTO_CREATE_STORAGE=true to create it automatically.`);
      }
      mkdirSync(storagePath, {recursive: true});
    }

    try {
      accessSync(storagePath, constants.R_OK | constants.W_OK);
    } catch {
      throw new Error(`ATOMIQ_STORAGE_PATH is not writable: ${storagePath}`);
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty env var should be treated as absent
    const intermediaryUrl = process.env.ATOMIQ_INTERMEDIARY_URL || undefined;
    const swapToken = required('ATOMIQ_SWAP_TOKEN');

    return {
      network: starknetNetwork === 'mainnet' ? 'mainnet' : 'testnet',
      starknetRpcUrl,
      storagePath,
      swapToken,
      autoCreateStorage,
      ...(intermediaryUrl !== undefined && {intermediaryUrl}),
    };
  }

  function parseAuthenticatorAttachment(value: string | undefined): AuthenticatorAttachment | undefined {
    if (!value) return undefined;
    const valid: AuthenticatorAttachment[] = ['platform', 'cross-platform'];
    if (!valid.includes(value as AuthenticatorAttachment)) {
      throw new Error(`Invalid WEBAUTHN_AUTHENTICATOR_ATTACHMENT: "${value}". Must be one of: ${valid.join(', ')}.`);
    }
    return value as AuthenticatorAttachment;
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
        ...(config.database.startupRequiredTable !== undefined && {
          startupRequiredTable: getTableName(config.database.startupRequiredTable)
        })
      },
      starknetRpcUrl: redactUrl(config.starknetRpcUrl),
      avnuApiKey: config.avnuApiKey ? '***' : '',
    };
  }
}
