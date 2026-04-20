import {AvnuBalanceLow, TreasuryBalanceLow} from '@bim/domain/notifications';
import type {NotificationGateway, PaymasterGateway, StarknetGateway} from '@bim/domain/ports';
import type {StarknetConfig} from '@bim/domain/shared';
import {serializeError} from '@bim/lib/error';
import type {Logger} from 'pino';

export const DEFAULT_AVNU_THRESHOLD_STRK = 15n;
export const DEFAULT_TREASURY_THRESHOLD_STRK = 100n;
export const DEFAULT_TREASURY_THRESHOLD_WBTC_SATS = 10_000n;

const STRK_DECIMALS = 10n ** 18n;

export interface BalanceMonitoringConfig {
  readonly avnuThresholdStrk?: bigint;
  readonly treasuryThresholdStrk?: bigint;
  readonly treasuryThresholdWbtcSats?: bigint;
}

export class BalanceMonitoring {
  private readonly log: Logger;

  constructor(
    private readonly starknetGateway: StarknetGateway,
    private readonly paymasterGateway: PaymasterGateway,
    private readonly notificationGateway: NotificationGateway,
    private readonly starknetConfig: StarknetConfig,
    private readonly config: BalanceMonitoringConfig,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: 'balance.monitoring.ts'});
  }

  async run(): Promise<void> {
    this.log.info('Running balance check');

    try {
      await this.checkAvnuCredits();
    } catch (err: unknown) {
      this.log.error({cause: serializeError(err)}, 'AVNU credits check failed');
    }

    try {
      await this.checkTreasuryBalance();
    } catch (err: unknown) {
      this.log.error({cause: serializeError(err)}, 'Treasury balance check failed');
    }
  }

  private async checkAvnuCredits(): Promise<void> {
    const currentBalance = await this.paymasterGateway.getRemainingCredits();
    const threshold = (this.config.avnuThresholdStrk ?? DEFAULT_AVNU_THRESHOLD_STRK) * STRK_DECIMALS;

    this.log.info({credits: currentBalance.toString(), threshold: threshold.toString()}, 'AVNU credits check');

    const alertMsg = AvnuBalanceLow.evaluate({
      network: this.starknetConfig.network,
      currentBalance,
      threshold,
    });
    if (alertMsg) {
      await this.notificationGateway.send(alertMsg);
    }
  }

  private async checkTreasuryBalance(): Promise<void> {
    const address = this.starknetConfig.feeTreasuryAddress;
    const strkThreshold = (this.config.treasuryThresholdStrk ?? DEFAULT_TREASURY_THRESHOLD_STRK) * STRK_DECIMALS;
    const wbtcThreshold = this.config.treasuryThresholdWbtcSats ?? DEFAULT_TREASURY_THRESHOLD_WBTC_SATS;

    const [strkBalance, wbtcBalance] = await Promise.all([
      this.starknetGateway.getBalance({address, token: 'STRK'}),
      this.fetchWbtcBalanceOrZero(address),
    ]);

    this.log.info(
      {
        address: address.toString(),
        strkBalance: strkBalance.toString(),
        wbtcBalance: wbtcBalance.toString(),
        strkThreshold: strkThreshold.toString(),
        wbtcThreshold: wbtcThreshold.toString(),
      },
      'Treasury balance check',
    );

    const alertMsg = TreasuryBalanceLow.evaluate({
      address,
      network: this.starknetConfig.network,
      strkBalance,
      wbtcBalance,
      strkThreshold,
      wbtcThreshold,
    });
    if (alertMsg) {
      await this.notificationGateway.send(alertMsg);
    }
  }

  private async fetchWbtcBalanceOrZero(address: StarknetConfig['feeTreasuryAddress']): Promise<bigint> {
    try {
      return await this.starknetGateway.getBalance({address, token: 'WBTC'});
    } catch (err: unknown) {
      this.log.warn({cause: serializeError(err)}, 'Treasury WBTC balance fetch failed');
      return 0n;
    }
  }
}
