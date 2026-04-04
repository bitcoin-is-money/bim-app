import type {StarknetAddress} from '../../shared';
import type {NotificationMessage} from '../../ports';
import {formatStrk, starkscanUrl, truncateAddress} from '../format';

const AVNU_PORTAL = 'https://portal.avnu.fi';

export class AvnuBalanceLow {
  static readonly name = 'avnu-balance-low';

  static evaluate(params: {
    address: StarknetAddress;
    network: string;
    currentBalance: bigint;
    threshold: bigint;
  }): NotificationMessage | undefined {
    if (params.currentBalance >= params.threshold) {
      return undefined;
    }

    const fields: Map<string, string> = new Map([
      ['Account', `\`${truncateAddress(params.address)}\``],
      ['Network', params.network],
      ['Balance', `${formatStrk(params.currentBalance)} STRK`],
      ['Threshold', `${formatStrk(params.threshold)} STRK`],
    ]);

    return {
      channel: '#alerting',
      severity: 'alert',
      title: 'AVNU Balance Low',
      description: 'The AVNU paymaster account balance is below the configured threshold. Please top up credits via the AVNU portal.',
      fields,
      links: [
        {label: 'AVNU Portal', url: AVNU_PORTAL},
        {label: 'View on Starkscan', url: starkscanUrl(params.address, params.network)},
      ],
      context: `bim-monitor ${params.network}`,
    };
  }
}
