import type { AtomiqGateway } from '../ports/atomiq.gateway';
import type { SwapRepository } from '../ports/swap.repository';
import { Swap } from './swap';
export interface CreateBitcoinSwapDeps {
    swapRepository: SwapRepository;
    atomiqGateway: AtomiqGateway;
}
export interface CreateBitcoinSwapInput {
    amountSats: bigint;
    destinationAddress: string;
}
export interface CreateBitcoinSwapOutput {
    swap: Swap;
    depositAddress: string;
    bip21Uri: string;
}
export type CreateBitcoinSwapUseCase = (input: CreateBitcoinSwapInput) => Promise<CreateBitcoinSwapOutput>;
/**
 * Creates a Bitcoin → Starknet swap.
 * User sends BTC to a deposit address, receives tokens on Starknet.
 */
export declare function getCreateBitcoinSwapUseCase(deps: CreateBitcoinSwapDeps): CreateBitcoinSwapUseCase;
//# sourceMappingURL=create-bitcoin-swap.usecase.d.ts.map