import {StarknetAddress} from '@bim/domain/account';
import {DEFAULT_AVNU_THRESHOLD_STRK, DEFAULT_BALANCE_CRON, DEFAULT_TREASURY_THRESHOLD_STRK, type SlackNotificationConfig, type BalanceMonitorConfig} from '@bim/monitoring';

export namespace IndexerConfig {

  export interface Config {
    port: number;
    preset: string;
    starknetRpcUrl: string;
    starknetNetwork: string;
    strkTokenAddress: StarknetAddress;
    wbtcTokenAddress: StarknetAddress;
    treasuryAddress: StarknetAddress;
    alerting: AlertingConfig | undefined;
  }

  export interface AlertingConfig {
    slack: SlackNotificationConfig;
    balanceMonitor: BalanceMonitorConfig;
  }

  /**
   * Loads configuration from environment variables.
   * Throws on missing required vars. Alerting is optional but all-or-nothing.
   */
  export function load(): Config {
    const strkTokenAddress = required('STRK_TOKEN_ADDRESS');

    return {
      port: Number(optional('PORT', '8080')),
      preset: optional('PRESET', 'mainnet'),
      starknetRpcUrl: required('STARKNET_RPC_URL'),
      starknetNetwork: optional('STARKNET_NETWORK', 'mainnet'),
      strkTokenAddress: StarknetAddress.of(strkTokenAddress),
      wbtcTokenAddress: StarknetAddress.of(required('WBTC_TOKEN_ADDRESS')),
      treasuryAddress: StarknetAddress.of(required('BIM_TREASURY_ADDRESS')),
      alerting: loadAlertingConfig(),
    };
  }

  function loadAlertingConfig(): AlertingConfig | undefined {
    if (optional('ENABLE_ALERTING', 'false') !== 'true') {
      return undefined;
    }
    const schedule = optional('ALERTING_BALANCE_CRON', DEFAULT_BALANCE_CRON);
    const avnuThresholdStrk = BigInt(optional('ALERTING_AVNU_THRESHOLD_STRK', String(DEFAULT_AVNU_THRESHOLD_STRK)));
    const treasuryThresholdStrk = BigInt(optional('ALERTING_TREASURY_THRESHOLD_STRK', String(DEFAULT_TREASURY_THRESHOLD_STRK)));

    return {
      slack: {
        botToken: required('ALERTING_SLACK_BOT_TOKEN'),
        channel: required('ALERTING_SLACK_CHANNEL'),
      },
      balanceMonitor: {
        avnuAddress: StarknetAddress.of(required('BIM_AVNU_ADDRESS')),
        schedule,
        avnuThresholdStrk,
        treasuryThresholdStrk,
      },
    };
  }

  function required(name: string): string {
    // eslint-disable-next-line security/detect-object-injection
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }

  function optional(name: string, defaultValue: string): string {
    // eslint-disable-next-line security/detect-object-injection, @typescript-eslint/prefer-nullish-coalescing
    return process.env[name] || defaultValue;
  }

}
