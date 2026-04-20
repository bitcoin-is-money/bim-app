import type {SwapDirection, SwapLimits} from '../types';

export interface FetchSwapLimitsInput {
  direction: SwapDirection;
}

export interface FetchSwapLimitsOutput {
  limits: SwapLimits;
}

/**
 * Fetches min/max amounts and fees for a given swap direction.
 */
export interface FetchSwapLimitsUseCase {
  fetchLimits(input: FetchSwapLimitsInput): Promise<FetchSwapLimitsOutput>;
}
