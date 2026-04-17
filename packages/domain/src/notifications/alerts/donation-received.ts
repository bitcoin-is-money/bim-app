import {formatSats} from '@bim/lib/token';
import type {NotificationMessage} from '../../ports';
import {truncateAddress} from '../format';

export class DonationReceived {
  static readonly name = 'donation-received';

  static build(params: {
    username: string;
    senderAddress: string;
    amountSats: bigint;
    network: string;
  }): NotificationMessage {
    const fields = new Map<string, string>([
      ['User', params.username],
      ['Address', `\`${truncateAddress(params.senderAddress)}\``],
      ['Amount', formatSats(params.amountSats, true)],
      ['Network', params.network],
    ]);

    return {
      channel: '#alerting',
      severity: 'info',
      title: 'Donation received',
      description: `*${params.username}* donated *${formatSats(params.amountSats, true)}*.`,
      fields,
      context: `bim-donations ${params.network}`,
    };
  }
}
