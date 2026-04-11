import type {StarknetAddress} from '../../account';
import type {PaymentNetwork} from '../types';

/**
 * Fee configuration for BIM developer tax, with per-network percentages.
 */
export class FeeConfig {
  static readonly DEFAULT_PERCENTAGES: Readonly<Record<PaymentNetwork, number>> = {
    starknet: 0.003,
    lightning: 0.003,
    bitcoin: 0.003,
  };

  readonly percentages: Readonly<Record<PaymentNetwork, number>>;
  readonly recipientAddress: StarknetAddress;

  private constructor(
    percentages: Record<PaymentNetwork, number>,
    recipientAddress: StarknetAddress,
  ) {
    this.percentages = percentages;
    this.recipientAddress = recipientAddress;
  }

  percentageFor(network: PaymentNetwork): number {
    switch (network) {
      case 'starknet': return this.percentages.starknet;
      case 'lightning': return this.percentages.lightning;
      case 'bitcoin': return this.percentages.bitcoin;
    }
  }

  static create(params: {
    percentages: Record<PaymentNetwork, number>;
    recipientAddress: StarknetAddress;
  }): FeeConfig {
    for (const [network, pct] of Object.entries(params.percentages)) {
      if (pct < 0 || pct > 1) {
        throw new Error(`Invalid fee percentage for ${network}: ${pct}. Must be between 0 and 1.`);
      }
    }
    return new FeeConfig(params.percentages, params.recipientAddress);
  }
}
