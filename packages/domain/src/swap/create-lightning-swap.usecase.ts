import {StarknetAddress} from '@bim/domain/account';
import type {AtomiqGateway, SwapRepository} from '@bim/domain/ports';
import {Swap} from './swap';
import {SwapAmountError, SwapCreationError, SwapId} from './types';

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
export function getCreateLightningSwapUseCase(deps: CreateLightningSwapDeps): CreateLightningSwapUseCase {
  return async (input: CreateLightningSwapInput): Promise<CreateLightningSwapOutput> => {
    const destinationAddress = StarknetAddress.of(input.destinationAddress);

    // Validate amount against limits
    const limits = await deps.atomiqGateway.getLightningToStarknetLimits();
    if (input.amountSats < limits.minSats || input.amountSats > limits.maxSats) {
      throw new SwapAmountError(input.amountSats, limits.minSats, limits.maxSats);
    }

    // Create swap via Atomiq
    const atomiqSwap = await deps.atomiqGateway.createLightningToStarknetSwap({
      amountSats: input.amountSats,
      destinationAddress,
    });

    if (!atomiqSwap.invoice) {
      throw new SwapCreationError('Failed to generate Lightning invoice');
    }

    const swap = Swap.createLightningToStarknet({
      id: SwapId.of(atomiqSwap.swapId),
      amountSats: input.amountSats,
      destinationAddress,
      invoice: atomiqSwap.invoice,
      expiresAt: atomiqSwap.expiresAt,
    });

    await deps.swapRepository.save(swap);
    await deps.atomiqGateway.registerSwapForMonitoring(
      SwapId.of(atomiqSwap.swapId),
      atomiqSwap.swapObject,
    );

    return { swap, invoice: atomiqSwap.invoice };
  };
}
