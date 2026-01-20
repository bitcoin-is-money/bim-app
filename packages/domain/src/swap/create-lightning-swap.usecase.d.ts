import type { AtomiqGateway } from '../ports/atomiq.gateway';
import type { SwapRepository } from '../ports/swap.repository';
import { Swap } from './swap';
export interface CreateLightningSwapDeps {
    swapRepository: SwapRepository;
    atomiqGateway: AtomiqGateway;
}
export interface CreateLightningSwapInput {
    amountSats: bigint;
    destinationAddress: string;
}
export interface CreateLightningSwapOutput {
    swap: Swap;
    invoice: string;
}
export type CreateLightningSwapUseCase = (input: CreateLightningSwapInput) => Promise<CreateLightningSwapOutput>;
/**
 * Creates a Lightning → Starknet swap.
 * User pays a Lightning invoice, receives tokens on Starknet.
 */
export declare function getCreateLightningSwapUseCase(deps: CreateLightningSwapDeps): CreateLightningSwapUseCase;
//# sourceMappingURL=create-lightning-swap.usecase.d.ts.map