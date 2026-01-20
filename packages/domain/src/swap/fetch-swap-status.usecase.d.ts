import type { AtomiqGateway } from '../ports/atomiq.gateway';
import type { SwapRepository } from '../ports/swap.repository';
import { Swap } from './swap';
import { type SwapStatus } from './types';
export interface FetchSwapStatusDeps {
    swapRepository: SwapRepository;
    atomiqGateway: AtomiqGateway;
}
export interface FetchSwapStatusInput {
    swapId: string;
}
export interface FetchSwapStatusOutput {
    swap: Swap;
    status: SwapStatus;
    progress: number;
    txHash?: string;
}
export type FetchSwapStatusUseCase = (input: FetchSwapStatusInput) => Promise<FetchSwapStatusOutput>;
/**
 * Fetches the current status of a swap.
 * Syncs with Atomiq if the swap is not in a terminal state.
 */
export declare function getFetchSwapStatusUseCase(deps: FetchSwapStatusDeps): FetchSwapStatusUseCase;
//# sourceMappingURL=fetch-swap-status.usecase.d.ts.map