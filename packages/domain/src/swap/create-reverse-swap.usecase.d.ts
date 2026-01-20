import type { AtomiqGateway } from '../ports/atomiq.gateway';
import type { SwapRepository } from '../ports/swap.repository';
import { Swap } from './swap';
export interface CreateReverseSwapDeps {
    swapRepository: SwapRepository;
    atomiqGateway: AtomiqGateway;
}
export interface CreateStarknetToLightningInput {
    invoice: string;
    sourceAddress: string;
}
export interface CreateStarknetToLightningOutput {
    swap: Swap;
    depositAddress: string;
    amountSats: bigint;
}
export type CreateStarknetToLightningUseCase = (input: CreateStarknetToLightningInput) => Promise<CreateStarknetToLightningOutput>;
/**
 * Creates a Starknet → Lightning swap.
 * User deposits tokens on Starknet, receives payment on Lightning.
 */
export declare function getCreateStarknetToLightningUseCase(deps: CreateReverseSwapDeps): CreateStarknetToLightningUseCase;
export interface CreateStarknetToBitcoinInput {
    amountSats: bigint;
    destinationAddress: string;
    sourceAddress: string;
}
export interface CreateStarknetToBitcoinOutput {
    swap: Swap;
    depositAddress: string;
}
export type CreateStarknetToBitcoinUseCase = (input: CreateStarknetToBitcoinInput) => Promise<CreateStarknetToBitcoinOutput>;
/**
 * Creates a Starknet → Bitcoin swap.
 * User deposits tokens on Starknet, receives BTC on-chain.
 */
export declare function getCreateStarknetToBitcoinUseCase(deps: CreateReverseSwapDeps): CreateStarknetToBitcoinUseCase;
//# sourceMappingURL=create-reverse-swap.usecase.d.ts.map