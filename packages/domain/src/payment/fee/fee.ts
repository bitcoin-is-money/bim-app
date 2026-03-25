import type {StarknetAddress} from '../../account';

/**
 * Fee configuration for BIM developer tax.
 */
export class FeeConfig {
  static readonly DEFAULT_PERCENTAGE = 0.001;

  readonly percentage: number;
  readonly recipientAddress: StarknetAddress;

  private constructor(
    percentage: number,
    recipientAddress: StarknetAddress
  ) {
    this.percentage = percentage;
    this.recipientAddress = recipientAddress;
  }

  static create(params: {
    percentage: number;
    recipientAddress: StarknetAddress;
  }): FeeConfig {
    if (params.percentage < 0 || params.percentage > 1) {
      throw new Error(`Invalid fee percentage: ${params.percentage}. Must be between 0 and 1.`);
    }
    return new FeeConfig(params.percentage, params.recipientAddress);
  }
}
