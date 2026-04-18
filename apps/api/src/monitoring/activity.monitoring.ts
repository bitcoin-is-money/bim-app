import {serializeError} from '@bim/lib/error';
import {ActivityReport} from '@bim/domain/notifications';
import type {AccountRepository, CountOptions, NotificationGateway, TransactionRepository} from '@bim/domain/ports';
import type {StarknetConfig} from '@bim/domain/shared';
import type {Logger} from 'pino';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COUNT_OPTIONS: CountOptions = {excludeUsernamePrefix: 'e2e_'};

export class ActivityMonitoring {
  private readonly log: Logger;

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly notificationGateway: NotificationGateway,
    private readonly starknetConfig: StarknetConfig,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: 'activity.monitoring.ts'});
  }

  async run(): Promise<void> {
    this.log.info('Building activity report');

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - WEEK_MS);

    try {
      const [totalUsers, totalTransactions, newUsers, newTransactions] = await Promise.all([
        this.accountRepository.countAll(COUNT_OPTIONS),
        this.transactionRepository.countAll(COUNT_OPTIONS),
        this.accountRepository.countCreatedSince(periodStart, COUNT_OPTIONS),
        this.transactionRepository.countCreatedSince(periodStart, COUNT_OPTIONS),
      ]);

      this.log.info(
        {totalUsers, totalTransactions, newUsers, newTransactions},
        'Activity report metrics collected',
      );

      const message = ActivityReport.build({
        network: this.starknetConfig.network,
        totalUsers,
        totalTransactions,
        newUsers,
        newTransactions,
        periodStart,
        periodEnd,
      });

      await this.notificationGateway.send(message);
    } catch (err: unknown) {
      this.log.error(
        {cause: serializeError(err)},
        'Activity report failed',
      );
    }
  }
}
