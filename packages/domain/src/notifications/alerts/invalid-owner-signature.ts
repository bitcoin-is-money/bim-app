import type {NotificationMessage} from '../../ports';
import type {StarknetAddress} from '../../shared';
import {starkscanUrl} from '../format';

/**
 * Slack alert sent when AVNU paymaster returns argent/invalid-owner-sig.
 * Contains all data AVNU support needs to reproduce the issue.
 */
export class InvalidOwnerSignature {
  static readonly name = 'invalid-owner-signature';

  static build(params: {
    senderAddress: StarknetAddress;
    publicKey: string;
    typedData: unknown;
    signature: string[];
    error: string;
    network: string;
  }): NotificationMessage {
    const typedDataJson = JSON.stringify(params.typedData, undefined, 2);
    const signatureStr = params.signature.join(', ');

    const fields = new Map<string, string>([
      ['Sender', `\`${params.senderAddress}\``],
      ['Public Key', `\`${params.publicKey}\``],
      ['Network', params.network],
    ]);

    const description = [
      'AVNU paymaster `executeTransaction` was rejected on-chain with `argent/invalid-owner-sig`.',
      'This error is generally intermittent — a retry with a fresh build usually succeeds.',
      '',
      '*Error*',
      `\`\`\`${params.error}\`\`\``,
      '',
      '*Signature (compact_no_legacy)*',
      `\`\`\`${signatureStr}\`\`\``,
      '',
      '*Typed Data (OutsideExecution)*',
      `\`\`\`${typedDataJson}\`\`\``,
    ].join('\n');

    return {
      channel: '#alerting',
      severity: 'error',
      title: 'Invalid Owner Signature (argent/invalid-owner-sig)',
      description,
      fields,
      links: [
        {label: 'Sender on Starkscan', url: starkscanUrl(params.senderAddress, params.network)},
      ],
      context: `bim-paymaster ${params.network}`,
    };
  }
}
