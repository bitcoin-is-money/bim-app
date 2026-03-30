import type {StarknetAddress} from '../../shared';
import type {NotificationMessage} from '../../ports';
import {formatStrk, starkscanUrl, truncateAddress} from '../format';

export class AvnuCreditsRecharged {
  static readonly name = 'avnu-credits-recharged';
  static readonly schedule = '0 8 * * *';

  static evaluate(params: {
    address: StarknetAddress;
    network: string;
    previousBalance: bigint;
    currentBalance: bigint;
  }): NotificationMessage | undefined {
    if (params.currentBalance <= params.previousBalance) {
      return undefined;
    }

    const fields: Map<string, string> = new Map([
      ['Account', `\`${truncateAddress(params.address)}\``],
      ['Previous Balance', `${formatStrk(params.previousBalance)} STRK`],
      ['New Balance', `${formatStrk(params.currentBalance)} STRK`],
    ]);

    return {
      severity: 'info',
      title: 'AVNU Credits Recharged',
      description: 'The AVNU paymaster account has been successfully recharged.',
      fields,
      links: [
        {label: 'View on Starkscan', url: starkscanUrl(params.address, params.network)},
      ],
      context: `bim-monitor ${params.network}`,
    };
  }
}
