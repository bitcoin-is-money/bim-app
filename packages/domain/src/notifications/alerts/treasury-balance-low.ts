import type {StarknetAddress} from '../../shared';
import type {NotificationMessage} from '../../ports';
import {formatStrk, starkscanUrl, truncateAddress} from '../format';

export class TreasuryBalanceLow {
  static readonly name = 'treasury-balance-low';
  static readonly threshold = 10_000_000_000_000_000_000n;
  static readonly schedule = '0 8 * * *';

  static evaluate(params: {
    address: StarknetAddress;
    network: string;
    currentBalance: bigint;
  }): NotificationMessage | undefined {
    if (params.currentBalance >= TreasuryBalanceLow.threshold) {
      return undefined;
    }

    const fields: Map<string, string> = new Map([
      ['Account', `\`${truncateAddress(params.address)}\``],
      ['Network', params.network],
      ['Balance', `${formatStrk(params.currentBalance)} STRK`],
      ['Threshold', `${formatStrk(TreasuryBalanceLow.threshold)} STRK`],
    ]);

    return {
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
