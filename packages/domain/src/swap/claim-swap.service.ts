import type {AtomiqGateway, SwapRepository} from '../ports';
import {Swap} from './swap';
import {InvalidSwapStateError, SwapClaimError, SwapId, SwapNotFoundError,} from './types';

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

export type ClaimSwapService = (input: ClaimSwapInput) => Promise<ClaimSwapOutput>;

/**
 * Claims a swap after payment has been received.
 * Triggers the final transfer to the destination address.
 */
export function getClaimSwapService(deps: ClaimSwapDeps): ClaimSwapService {
  return async (input: ClaimSwapInput): Promise<ClaimSwapOutput> => {
    const swapId = SwapId.of(input.swapId);

    const swap = await deps.swapRepository.findById(swapId);
    if (!swap) {
      throw new SwapNotFoundError(swapId);
    }

    // Check expiration
    if (swap.isExpired()) {
      swap.markAsExpired();
      await deps.swapRepository.save(swap);
      throw new InvalidSwapStateError('expired', 'claim');
    }

    if (!swap.canClaim()) {
      throw new InvalidSwapStateError(swap.getStatus(), 'claim');
    }

    try {
      const result = await deps.atomiqGateway.claimSwap(swapId);

      swap.markAsConfirming(result.txHash);
      await deps.swapRepository.save(swap);

      // Wait for confirmation asynchronously
      waitForClaimConfirmation(deps, swap, result.txHash);

      return { swap, txHash: result.txHash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      swap.markAsFailed(message);
      await deps.swapRepository.save(swap);
      throw new SwapClaimError(swapId, message);
    }
  };
}

/**
 * Waits for on-chain confirmation and updates swap status.
 */
async function waitForClaimConfirmation(
  deps: ClaimSwapDeps,
  swap: Swap,
  txHash: string,
): Promise<void> {
  try {
    await deps.atomiqGateway.waitForClaimConfirmation(swap.id);
    swap.markAsCompleted(txHash);
    await deps.swapRepository.save(swap);
  } catch {
    // Don't mark as failed - let the monitor handle final state
  }
}
