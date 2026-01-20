import {StarknetAddress} from '../account/types';
import type {AtomiqGateway} from '../ports/atomiq.gateway';
import type {SwapRepository} from '../ports/swap.repository';
import {Swap} from './swap';
import {SwapAmountError, SwapCreationError, SwapId} from './types';

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
export function getCreateBitcoinSwapUseCase(deps: CreateBitcoinSwapDeps): CreateBitcoinSwapUseCase {
  return async (input: CreateBitcoinSwapInput): Promise<CreateBitcoinSwapOutput> => {
    const destinationAddress = StarknetAddress.of(input.destinationAddress);

    // Validate amount against limits
    const limits = await deps.atomiqGateway.getBitcoinToStarknetLimits();
    if (input.amountSats < limits.minSats || input.amountSats > limits.maxSats) {
      throw new SwapAmountError(input.amountSats, limits.minSats, limits.maxSats);
    }

    // Create swap via Atomiq
    const atomiqSwap = await deps.atomiqGateway.createBitcoinToStarknetSwap({
      amountSats: input.amountSats,
      destinationAddress,
    });

    if (!atomiqSwap.depositAddress) {
      throw new SwapCreationError('Failed to generate Bitcoin deposit address');
    }

    const swap = Swap.createBitcoinToStarknet({
      id: SwapId.of(atomiqSwap.swapId),
      amountSats: input.amountSats,
      destinationAddress,
      depositAddress: atomiqSwap.depositAddress,
      expiresAt: atomiqSwap.expiresAt,
    });

    await deps.swapRepository.save(swap);
    await deps.atomiqGateway.registerSwapForMonitoring(
      SwapId.of(atomiqSwap.swapId),
      atomiqSwap.swapObject,
    );

    return {
      swap,
      depositAddress: atomiqSwap.depositAddress,
      bip21Uri: atomiqSwap.bip21Uri || `bitcoin:${atomiqSwap.depositAddress}`,
    };
  };
}
