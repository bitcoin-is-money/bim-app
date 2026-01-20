import type { AtomiqGateway } from '../ports/atomiq.gateway';
import type { SwapRepository } from '../ports/swap.repository';
import { Swap } from './swap';
export interface ClaimSwapDeps {
    swapRepository: SwapRepository;
    atomiqGateway: AtomiqGateway;
}
export interface ClaimSwapInput {
    swapId: string;
}
export interface ClaimSwapOutput {
    swap: Swap;
    txHash: string;
}
export type ClaimSwapUseCase = (input: ClaimSwapInput) => Promise<ClaimSwapOutput>;
/**
 * Claims a swap after payment has been received.
 * Triggers the final transfer to the destination address.
 */
export declare function getClaimSwapUseCase(deps: ClaimSwapDeps): ClaimSwapUseCase;
//# sourceMappingURL=claim-swap.usecase.d.ts.map