import type {NotificationGateway, StarknetGateway} from '@bim/domain/ports';
import type {StarknetAddress, StarknetConfig} from '@bim/domain/shared';
import {AvnuBalanceLow, AvnuCreditsRecharged, TreasuryBalanceLow} from '@bim/domain/notifications';
import {Cron} from 'croner';
import type {Logger} from 'pino';

export const DEFAULT_BALANCE_CRON = '0 8 * * *';
export const DEFAULT_AVNU_THRESHOLD_STRK = 15n;
export const DEFAULT_TREASURY_THRESHOLD_STRK = 200n;

const STRK_DECIMALS = 10n ** 18n;

export interface BalanceMonitorConfig {
  readonly avnuAddress: StarknetAddress;
  readonly schedule?: string;
  readonly avnuThresholdStrk?: bigint;
  readonly treasuryThresholdStrk?: bigint;
}

/**
 * Periodically checks AVNU and treasury STRK balances
 * and sends alerts when thresholds are breached.
 *
 * Schedule is defined in each alert class.
 * All balance alerts share the same "0 8 * * *" schedule so a single cron job handles them.
 */
export class BalanceMonitor {
  private cron: Cron | undefined;
  private readonly log: Logger;
  private lastAvnuBalance: bigint | undefined;

  constructor(
    private readonly starknetGateway: StarknetGateway,
    private readonly notificationGateway: NotificationGateway,
    private readonly starknetConfig: StarknetConfig,
    private readonly config: BalanceMonitorConfig,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: 'balance.monitor.ts'});
  }

  start(): void {
    if (this.cron) return;

    const schedule = this.config.schedule ?? DEFAULT_BALANCE_CRON;
    this.log.info({schedule}, 'Starting BalanceMonitor');

    this.cron = new Cron(schedule, () => void this.runIteration());
  }

  async stop(): Promise<void> {
    if (this.cron) {
      this.cron.stop();
      this.cron = undefined;
      this.log.info('BalanceMonitor stopped');
    }
  }

  /**
   * Runs a single monitoring iteration. Exposed for testing.
   */
  async runIteration(): Promise<void> {
    this.log.info('Running balance check');

    try {
      await this.checkAvnuBalance();
    } catch (err) {
      this.log.error({cause: err instanceof Error
          ? err.message
          : String(err)}, 'AVNU balance check failed');
    }

    try {
      await this.checkTreasuryBalance();
    } catch (err) {
      this.log.error({cause: err instanceof Error
          ? err.message
          : String(err)}, 'Treasury balance check failed');
    }
  }

  private async checkAvnuBalance(): Promise<void> {
    const address = this.config.avnuAddress;
    const network = this.starknetConfig.network;
    const token = this.starknetConfig.strkTokenAddress;

    const currentBalance = await this.starknetGateway.getBalance({address, token});

    // Check if credits were recharged since the last check
    if (this.lastAvnuBalance !== undefined) {
      const rechargeMsg = AvnuCreditsRecharged.evaluate({
        address,
        network,
        previousBalance: this.lastAvnuBalance,
        currentBalance,
      });
      if (rechargeMsg) {
        await this.notificationGateway.send(rechargeMsg);
      }
    }

    this.lastAvnuBalance = currentBalance;

    // Check threshold
    const threshold = (this.config.avnuThresholdStrk ?? DEFAULT_AVNU_THRESHOLD_STRK) * STRK_DECIMALS;
    const alertMsg = AvnuBalanceLow.evaluate({address, network, currentBalance, threshold});
    if (alertMsg) {
      await this.notificationGateway.send(alertMsg);
    }
  }

  private async checkTreasuryBalance(): Promise<void> {
    const address = this.starknetConfig.feeTreasuryAddress;
    const network = this.starknetConfig.network;
    const token = this.starknetConfig.strkTokenAddress;
    const currentBalance = await this.starknetGateway.getBalance({address, token});
    const threshold = (this.config.treasuryThresholdStrk ?? DEFAULT_TREASURY_THRESHOLD_STRK) * STRK_DECIMALS;
    const alertMsg = TreasuryBalanceLow.evaluate({address, network, currentBalance, threshold});
    if (alertMsg) {
      await this.notificationGateway.send(alertMsg);
    }
  }
}
