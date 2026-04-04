import type {StarknetAddress} from '../../shared';
import type {SwapId} from '../../swap';
import type {NotificationMessage} from '../../ports';
import {starkscanUrl, truncateAddress} from '../format';

export class SwapClaimFailed {
  static readonly name = 'swap-claim-failed';

  static build(params: {
    swapId: SwapId;
    userAddress: StarknetAddress;
    network: string;
    amount: string;
    error: string;
  }): NotificationMessage {
    const fields: Map<string, string> = new Map([
      ['Swap ID', `\`${params.swapId}\``],
      ['User', `\`${truncateAddress(params.userAddress)}\``],
      ['Amount', params.amount],
      ['Error', params.error],
    ]);

    return {
      channel: '#alerting',
      severity: 'error',
      title: 'Swap Claim Failed',
      description: 'A forward swap claim transaction failed. Manual intervention may be required to recover funds.',
      fields,
      links: [
        {label: 'User on Starkscan', url: starkscanUrl(params.userAddress, params.network)},
      ],
      context: `bim-monitor ${params.network}`,
    };
  }
}
