import type {StarknetCall} from './starknet.gateway';

/**
 * Gateway for token swap operations.
 */
export interface SwapGateway {
  /**
   * Gets the calls needed to swap tokens.
   * Returns StarknetCalls (approve + swap) ready to be included in a multicall.
   *
   * @param params.sellToken - Address of the token to sell
   * @param params.buyToken - Address of the token to buy
   * @param params.buyAmount - Desired amount of buy token (exact output)
   * @param params.takerAddress - Account address performing the swap
   */
  getSwapCalls(params: {
    sellToken: string;
    buyToken: string;
    buyAmount: bigint;
    takerAddress: string;
  }): Promise<{
    calls: StarknetCall[];
    sellAmount: bigint;
    buyAmount: bigint;
  }>;
}
