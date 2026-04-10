import {AvnuBalanceLow, TreasuryBalanceLow} from '@bim/domain/notifications';
import type {NotificationGateway, PaymasterGateway, StarknetGateway} from '@bim/domain/ports';
import type {StarknetConfig} from '@bim/domain/shared';
import type {Logger} from 'pino';

export const DEFAULT_AVNU_THRESHOLD_STRK = 15n;
export const DEFAULT_TREASURY_THRESHOLD_STRK = 200n;

const STRK_DECIMALS = 10n ** 18n;

export interface BalanceMonitoringConfig {
  readonly avnuThresholdStrk?: bigint;
  readonly treasuryThresholdStrk?: bigint;
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
      this.log.error({cause: err instanceof Error ? err.message : String(err)}, 'AVNU credits check failed');
    }

    try {
      await this.checkTreasuryBalance();
    } catch (err: unknown) {
      this.log.error({cause: err instanceof Error ? err.message : String(err)}, 'Treasury balance check failed');
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
    const token = 'STRK';
    const currentBalance = await this.starknetGateway.getBalance({address, token});
    const threshold = (this.config.treasuryThresholdStrk ?? DEFAULT_TREASURY_THRESHOLD_STRK) * STRK_DECIMALS;

    this.log.info({address: address.toString(), balance: currentBalance.toString(), threshold: threshold.toString()}, 'Treasury balance check');

    const alertMsg = TreasuryBalanceLow.evaluate({
      address,
      network: this.starknetConfig.network,
      currentBalance,
      threshold,
    });
    if (alertMsg) {
      await this.notificationGateway.send(alertMsg);
    }
  }
}
