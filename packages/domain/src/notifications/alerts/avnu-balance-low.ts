import {formatStrk} from '@bim/lib/token';
import type {NotificationMessage} from '../../ports';

const AVNU_PORTAL = 'https://portal.avnu.fi';

export class AvnuBalanceLow {
  static readonly name = 'avnu-balance-low';

  static evaluate(params: {
    network: string;
    currentBalance: bigint;
    threshold: bigint;
  }): NotificationMessage | undefined {
    if (params.currentBalance >= params.threshold) {
      return undefined;
    }

    const fields = new Map<string, string>([
      ['Network', params.network],
      ['Remaining credits', formatStrk(params.currentBalance, true)],
      ['Threshold', formatStrk(params.threshold, true)],
    ]);

    return {
      channel: '#alerting',
      severity: 'alert',
      title: 'AVNU Credits Low',
      description: 'The AVNU paymaster sponsor credits are below the configured threshold. Please top up credits via the AVNU portal.',
      fields,
      links: [
        {label: 'AVNU Portal', url: AVNU_PORTAL},
      ],
      context: `bim-monitor ${params.network}`,
    };
  }
}
