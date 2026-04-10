import type {NotificationMessage} from '../../ports';
import type {StarknetAddress} from '../../shared';
import {formatStrk, starkscanUrl, truncateAddress} from '../format';

export class TreasuryBalanceLow {
  static readonly name = 'treasury-balance-low';

  static evaluate(params: {
    address: StarknetAddress;
    network: string;
    currentBalance: bigint;
    threshold: bigint;
  }): NotificationMessage | undefined {
    if (params.currentBalance >= params.threshold) {
      return undefined;
    }

    const fields = new Map<string, string>([
      ['Account', `\`${truncateAddress(params.address)}\``],
      ['Network', params.network],
      ['Balance', `${formatStrk(params.currentBalance)} STRK`],
      ['Threshold', `${formatStrk(params.threshold)} STRK`],
    ]);

    return {
      channel: '#alerting',
      severity: 'alert',
      title: 'Treasury Balance Low',
      description: 'The BIM treasury account balance is below the configured threshold. Please refund the account.',
      fields,
      links: [
        {label: 'View on Starkscan', url: starkscanUrl(params.address, params.network)},
      ],
      context: `bim-monitor ${params.network}`,
    };
  }
}
