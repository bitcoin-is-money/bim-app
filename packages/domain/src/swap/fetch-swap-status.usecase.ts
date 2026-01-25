import type {AtomiqGateway, SwapRepository} from '../ports';
import {Swap} from './swap';
import {SwapId, SwapNotFoundError, type SwapStatus} from './types';

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
export function getFetchSwapStatusUseCase(deps: FetchSwapStatusDeps): FetchSwapStatusUseCase {
  return async (input: FetchSwapStatusInput): Promise<FetchSwapStatusOutput> => {
    const swapId = SwapId.of(input.swapId);

    const swap = await deps.swapRepository.findById(swapId);
    if (!swap) {
      throw new SwapNotFoundError(swapId);
    }

    // Sync with Atomiq if not in the terminal state
    if (!swap.isTerminal()) {
      await syncWithAtomiq(deps, swap);
    }

    return {
      swap,
      status: swap.getStatus(),
      progress: swap.getProgress(),
      txHash: swap.getTxHash(),
    };
  };
}

/**
 * Syncs local swap state with Atomiq.
 */
async function syncWithAtomiq(deps: FetchSwapStatusDeps, swap: Swap): Promise<void> {
  try {
    const atomiqStatus = await deps.atomiqGateway.getSwapStatus(swap.id);

    if (atomiqStatus.isPaid && swap.getStatus() === 'pending') {
      swap.markAsPaid();
      await deps.swapRepository.save(swap);
    } else if (atomiqStatus.isCompleted && swap.getStatus() !== 'completed') {
      if (swap.getStatus() === 'pending') {
        swap.markAsPaid();
      }
      if (swap.getStatus() === 'paid') {
        swap.markAsConfirming(atomiqStatus.txHash || 'unknown');
      }
      swap.markAsCompleted(atomiqStatus.txHash);
      await deps.swapRepository.save(swap);
    } else if (atomiqStatus.isFailed) {
      swap.markAsFailed(atomiqStatus.error || 'Unknown error');
      await deps.swapRepository.save(swap);
    } else if (atomiqStatus.isExpired) {
      swap.markAsExpired();
      await deps.swapRepository.save(swap);
    }
  } catch {
    // Ignore sync errors - return current local state
  }
}
