import * as schema from '@bim/db';
import type {DatabaseConfig} from '@bim/db/database';
import {StarknetAddress} from '@bim/domain/account';
import {SessionConfig} from '@bim/domain/auth';
import {type StarknetConfig, StarknetNetwork} from '@bim/domain/shared';
import type {ClaimerConfig} from '@bim/domain/swap';
import {redactUrl} from '@bim/lib/url';
import {getTableName} from 'drizzle-orm';
import type {
  AtomiqGatewayConfig,
  AuthenticatorAttachment,
  AvnuPaymasterConfig,
  AvnuSwapConfig,
  SlackNotificationConfig,
  WebAuthnConfig
} from './adapters';
import type {BalanceMonitoringConfig} from './monitoring/balance.monitoring';

/** Well-known STRK token contract address (same on mainnet and testnet). */
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

export namespace AppConfig {

  export interface CronConfig {
    secret: string;
    balanceMonitoring: BalanceMonitoringConfig;
  }

  export interface AlertingConfig {
    slack: SlackNotificationConfig | undefined;
  }

  export interface Config {
    appVersion: string;
    port: number;
    nodeEnv: string;
    session: SessionConfig;
    starknet: StarknetConfig;
    database: Partial<DatabaseConfig>;
    avnuPaymaster: AvnuPaymasterConfig;
    avnuSwap: AvnuSwapConfig;
    atomiq: Omit<AtomiqGatewayConfig, 'pool'>;
    webauthn: WebAuthnConfig;
    alerting: AlertingConfig;
    cron: CronConfig | undefined;
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

    const starknetNetwork = optional('STARKNET_NETWORK', 'testnet') as StarknetNetwork;
    if (!['mainnet', 'testnet', 'devnet'].includes(starknetNetwork)) {
      throw new Error(`Invalid STARKNET_NETWORK: ${starknetNetwork}. Must be 'mainnet', 'testnet', or 'devnet'.`);
    }

    const starknetRpcUrl = required('STARKNET_RPC_URL');
    const wbtcTokenAddress = required('WBTC_TOKEN_ADDRESS');
    const knownTokenAddresses = [
      StarknetAddress.of(wbtcTokenAddress),
      StarknetAddress.of(STRK_TOKEN_ADDRESS)
    ];
    const authenticatorAttachment = parseAuthenticatorAttachment(process.env.WEBAUTHN_AUTHENTICATOR_ATTACHMENT);

    const starknet: StarknetConfig = {
      network: starknetNetwork,
      bitcoinNetwork: StarknetNetwork.toBitcoinNetwork(starknetNetwork),
      rpcUrl: starknetRpcUrl,
      accountClassHash: required('ACCOUNT_CLASS_HASH'),
      wbtcTokenAddress: StarknetAddress.of(wbtcTokenAddress),
      strkTokenAddress: StarknetAddress.of(STRK_TOKEN_ADDRESS),
      feeTreasuryAddress: StarknetAddress.of(required('BIM_TREASURY_ADDRESS')),
    };

    const claimer: ClaimerConfig = {
      privateKey: required('CLAIMER_PRIVATE_KEY'),
      address: StarknetAddress.of(required('CLAIMER_ADDRESS')),
    };

    return {
      appVersion: optional('APP_VERSION', 'dev'),
      port: Number.parseInt(optional('PORT', '8080'), 10),
      nodeEnv: optional('NODE_ENV', 'development'),
      session: SessionConfig.create({
        durationMs: Number.parseInt(optional('SESSION_DURATION_MS', String(SessionConfig.DEFAULT_DURATION_MS)), 10),
      }),
      starknet,
      database: {
        url: required('DATABASE_URL'),
        startupRequiredTable: schema.accounts,
      },
      avnuPaymaster: {
        apiUrl: optional('AVNU_API_URL', 'https://starknet.paymaster.avnu.fi'),
        apiKey: optional('AVNU_API_KEY', ''),
      },
      avnuSwap: {
        baseUrl: optional('AVNU_SWAP_API_URL',
          starknetNetwork === 'mainnet'
            ? 'https://starknet.api.avnu.fi'
            : 'https://sepolia.api.avnu.fi'),
        knownTokenAddresses,
      },
      atomiq: loadAtomiqConfig(required, optional, starknetNetwork, starknetRpcUrl, knownTokenAddresses, claimer),
      webauthn: {
        rpId: required('WEBAUTHN_RP_ID'),
        rpName: optional('WEBAUTHN_RP_NAME', 'BIM'),
        origin: required('WEBAUTHN_ORIGIN'),
        ...(authenticatorAttachment !== undefined && {authenticatorAttachment}),
      },
      alerting: loadAlertingConfig(optional),
      cron: loadCronConfig(optional),
      logLevel: optional('LOG_LEVEL', 'debug'),
    };
  }

  function loadAlertingConfig(optional: (name: string, defaultValue: string) => string): AlertingConfig {
    const slackBotToken = optional('ALERTING_SLACK_BOT_TOKEN', '');
    return {
      slack: slackBotToken ? {botToken: slackBotToken} : undefined,
    };
  }

  function loadCronConfig(optional: (name: string, defaultValue: string) => string): CronConfig | undefined {
    const secret = optional('CRON_SECRET', '');
    const avnuAddress = optional('BIM_AVNU_ADDRESS', '');

    if (!secret || !avnuAddress) {
      return undefined;
    }

    return {
      secret,
      balanceMonitoring: {
        avnuAddress: StarknetAddress.of(avnuAddress),
        avnuThresholdStrk: BigInt(optional('ALERTING_AVNU_THRESHOLD_STRK', '15')),
        treasuryThresholdStrk: BigInt(optional('ALERTING_TREASURY_THRESHOLD_STRK', '200')),
      },
    };
  }

  function loadAtomiqConfig(
    required: (name: string) => string,
    _optional: (name: string, defaultValue: string) => string,
    starknetNetwork: StarknetNetwork,
    starknetRpcUrl: string,
    knownTokenAddresses: readonly StarknetAddress[],
    claimer: ClaimerConfig,
  ): Omit<AtomiqGatewayConfig, 'pool'> {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty env var should be treated as absent
    const intermediaryUrl = process.env.ATOMIQ_INTERMEDIARY_URL || undefined;
    const swapToken = required('ATOMIQ_SWAP_TOKEN');

    return {
      network: starknetNetwork === 'mainnet' ? 'mainnet' : 'testnet',
      starknetRpcUrl,
      swapToken,
      knownTokenAddresses,
      claimer,
      strkTokenAddress: STRK_TOKEN_ADDRESS,
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
      starknet: {
        ...config.starknet,
        rpcUrl: redactUrl(config.starknet.rpcUrl),
      },
      database: {
        ...config.database,
        url: redactUrl(config.database.url),
        ...(config.database.startupRequiredTable !== undefined && {
          startupRequiredTable: getTableName(config.database.startupRequiredTable)
        })
      },
      atomiq: {
        ...config.atomiq,
        claimer: {...config.atomiq.claimer, privateKey: '***'},
      },
      avnuPaymaster: {
        ...config.avnuPaymaster,
        apiKey: config.avnuPaymaster.apiKey ? '***' : '',
      },
      alerting: {
        slack: config.alerting.slack ? {botToken: '***'} : undefined,
      },
      cron: config.cron
        ? {
          ...config.cron,
          secret: '***',
        }
        : undefined,
    };
  }
}
