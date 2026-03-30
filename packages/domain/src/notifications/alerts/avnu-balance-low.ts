import type {StarknetAddress} from '../../shared';
import type {NotificationMessage} from '../../ports';
import {formatStrk, starkscanUrl, truncateAddress} from '../format';

const AVNU_PORTAL = 'https://portal.avnu.fi';

export class AvnuBalanceLow {
  static readonly name = 'avnu-balance-low';
  static readonly threshold = 5_000_000_000_000_000_000n;
  static readonly schedule = '0 8 * * *';

  static evaluate(params: {
    address: StarknetAddress;
    network: string;
    currentBalance: bigint;
  }): NotificationMessage | undefined {
    if (params.currentBalance >= AvnuBalanceLow.threshold) {
      return undefined;
    }

    const fields: Map<string, string> = new Map([
      ['Account', `\`${truncateAddress(params.address)}\``],
      ['Network', params.network],
      ['Balance', `${formatStrk(params.currentBalance)} STRK`],
      ['Threshold', `${formatStrk(AvnuBalanceLow.threshold)} STRK`],
    ]);

    return {
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
