import type {StarknetAddress} from '../../account';

/**
 * Fee configuration for BIM developer tax.
 */
export interface FeeConfig {
  /**
   * Fee percentage as decimal (e.g., 0.001 = 0.1%).
   * Must be between 0 and 1.
   */
  readonly percentage: number;

  /**
   * BIM treasury address that receives the fees.
   */
  readonly recipientAddress: StarknetAddress;
}

export namespace FeeConfig {
  /**
   * Default fee configuration (0.1% fee).
   */
  export const DEFAULT_PERCENTAGE = 0.001;

  /**
   * Creates a FeeConfig with validation.
   */
  export function create(params: {
    percentage: number;
    recipientAddress: StarknetAddress;
  }): FeeConfig {
    if (params.percentage < 0 || params.percentage > 1) {
      throw new Error(`Invalid fee percentage: ${params.percentage}. Must be between 0 and 1.`);
    }
    return {
      percentage: params.percentage,
      recipientAddress: params.recipientAddress,
    };
  }
}
