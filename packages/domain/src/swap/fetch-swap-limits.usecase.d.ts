import type { AtomiqGateway } from "../ports/atomiq.gateway";
import { type SwapDirection, type SwapLimits } from './types';
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
export declare function getFetchSwapLimitsUseCase(deps: FetchSwapLimitsDeps): FetchSwapLimitsUseCase;
//# sourceMappingURL=fetch-swap-limits.usecase.d.ts.map