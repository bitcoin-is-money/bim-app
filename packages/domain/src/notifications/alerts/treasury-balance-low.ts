import {formatSats, formatStrk} from '@bim/lib/token';
import type {NotificationMessage} from '../../ports';
import type {StarknetAddress} from '../../shared';
import {starkscanUrl, truncateAddress} from '../format';

export class TreasuryBalanceLow {
  static readonly name = 'treasury-balance-low';

  static evaluate(params: {
    address: StarknetAddress;
    network: string;
    strkBalance: bigint;
    wbtcBalance: bigint;
    strkThreshold: bigint;
    wbtcThreshold: bigint;
  }): NotificationMessage | undefined {
    const strkLow = params.strkBalance < params.strkThreshold;
    const wbtcLow = params.wbtcBalance < params.wbtcThreshold;
    if (!strkLow && !wbtcLow) {
      return undefined;
    }

    const fields = new Map<string, string>([
      ['Account', `\`${truncateAddress(params.address)}\``],
      ['Network', params.network],
      ['STRK Balance', formatStrk(params.strkBalance, true)],
      ['STRK Threshold', formatStrk(params.strkThreshold, true)],
      ['WBTC Balance', formatSats(params.wbtcBalance, true)],
      ['WBTC Threshold', formatSats(params.wbtcThreshold, true)],
    ]);

    const assetsLow = [strkLow && 'STRK', wbtcLow && 'WBTC'].filter(Boolean).join(' and ');

    return {
      channel: '#alerting',
      severity: 'alert',
      title: 'Treasury Balance Low',
      description: `The BIM treasury ${assetsLow} balance is below the configured threshold. Please refund the account.`,
      fields,
      links: [
        {label: 'View on Starkscan', url: starkscanUrl(params.address, params.network)},
      ],
      context: `bim-monitor ${params.network}`,
    };
  }
}
