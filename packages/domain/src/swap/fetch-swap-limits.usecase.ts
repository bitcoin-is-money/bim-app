import type {AtomiqGateway} from "../ports/atomiq.gateway";
import {type SwapDirection, type SwapLimits} from './types';

export interface FetchSwapLimitsDeps {
  atomiqGateway: AtomiqGateway;
}

export interface FetchSwapLimitsInput {
  direction: SwapDirection;
}

export interface FetchSwapLimitsOutput {
  limits: SwapLimits;
}

export type FetchSwapLimitsUseCase = (input: FetchSwapLimitsInput) => Promise<FetchSwapLimitsOutput>;

/**
 * Fetches min/max amounts and fees for a given swap direction.
 */
export function getFetchSwapLimitsUseCase(deps: FetchSwapLimitsDeps): FetchSwapLimitsUseCase {
  return async (input: FetchSwapLimitsInput): Promise<FetchSwapLimitsOutput> => {
    let limits: SwapLimits;

    switch (input.direction) {
      case 'lightning_to_starknet':
        limits = await deps.atomiqGateway.getLightningToStarknetLimits();
        break;
      case 'bitcoin_to_starknet':
        limits = await deps.atomiqGateway.getBitcoinToStarknetLimits();
        break;
      case 'starknet_to_lightning':
        limits = await deps.atomiqGateway.getStarknetToLightningLimits();
        break;
      case 'starknet_to_bitcoin':
        limits = await deps.atomiqGateway.getStarknetToBitcoinLimits();
        break;
    }

    return { limits };
  };
}
