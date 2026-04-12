import type {NotificationMessage} from '../../ports';

const REPORTING_CHANNEL = '#reporting';

export interface ActivityReportParams {
  readonly network: string;
  readonly totalUsers: number;
  readonly totalTransactions: number;
  readonly newUsers: number;
  readonly newTransactions: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

/**
 * Builds a Slack-friendly notification summarising BIM usage KPIs: total
 * users, total transactions, and the delta over a reporting period. Unlike
 * alerts, a report is always emitted — there is no threshold.
 */
export class ActivityReport {
  static readonly name = 'activity-report';

  static build(params: ActivityReportParams): NotificationMessage {
    const description =
      `*From ${formatDate(params.periodStart)} to ${formatDate(params.periodEnd)}*\n`
      + `    New users: ${formatNumber(params.newUsers)}\n`
      + `    New transactions: ${formatNumber(params.newTransactions)}\n`
      + '\n'
      + '*All time*\n'
      + `    Total users: ${formatNumber(params.totalUsers)}\n`
      + `    Total transactions: ${formatNumber(params.totalTransactions)}`;

    return {
      channel: REPORTING_CHANNEL,
      severity: 'info',
      title: 'BIM Activity Report',
      description,
      fields: new Map<string, string>(),
      context: `bim-reporting ${params.network}`,
    };
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
