import type {Logger} from 'pino';
import {AccountId} from '../../account';
import type {AtomiqGateway, SwapRepository, TransactionRepository} from '../../ports';
import {TransactionHash} from '../../user/types';
import {SwapNotFoundError, SwapOwnershipError} from '../errors';
import type {Swap} from '../swap';
import {SwapId, type SwapLimits} from '../types';
import type {
  FetchSwapLimitsInput,
  FetchSwapLimitsOutput,
  FetchSwapLimitsUseCase,
} from '../use-cases/fetch-swap-limits.use-case';
import type {
  FetchSwapStatusInput,
  FetchSwapStatusOutput,
  FetchSwapStatusUseCase,
} from '../use-cases/fetch-swap-status.use-case';

export interface SwapReaderDeps {
  swapRepository: SwapRepository;
  atomiqGateway: AtomiqGateway;
  transactionRepository: TransactionRepository;
  logger: Logger;
}

/**
 * Read-only queries on swaps. Groups the two primary-port queries:
 * - `fetchLimits(direction)` — min/max amount + fee estimate per direction.
 * - `fetchStatus({swapId, accountId})` — current state + progress, synced
 *   with Atomiq when the swap is not in a terminal state.
 */
export class SwapReader implements FetchSwapLimitsUseCase, FetchSwapStatusUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: SwapReaderDeps) {
    this.log = deps.logger.child({name: 'swap-reader.service.ts'});
  }

  async fetchLimits(input: FetchSwapLimitsInput): Promise<FetchSwapLimitsOutput> {
    let limits: SwapLimits;

    switch (input.direction) {
      case 'lightning_to_starknet':
        limits = await this.deps.atomiqGateway.getLightningToStarknetLimits();
        break;
      case 'bitcoin_to_starknet':
        limits = await this.deps.atomiqGateway.getBitcoinToStarknetLimits();
        break;
      case 'starknet_to_lightning':
        limits = await this.deps.atomiqGateway.getStarknetToLightningLimits();
        break;
      case 'starknet_to_bitcoin':
        limits = await this.deps.atomiqGateway.getStarknetToBitcoinLimits();
        break;
    }

    return {limits};
  }

  /**
   * @throws SwapNotFoundError if swap doesn't exist
   * @throws SwapOwnershipError if the swap belongs to another account
   */
  async fetchStatus(input: FetchSwapStatusInput): Promise<FetchSwapStatusOutput> {
    const swapId = SwapId.of(input.swapId);
    const accountId = AccountId.of(input.accountId);

    const swap = await this.deps.swapRepository.findById(swapId);
    if (!swap) {
      throw new SwapNotFoundError(swapId);
    }

    if (swap.data.accountId !== accountId) {
      throw new SwapOwnershipError(swapId);
    }

    // Atomiq is the source of truth — always sync non-terminal swaps.
    // Double-claim is prevented orthogonally: SwapCoordinator.recordClaimAttempt
    // persists the attempt; SwapMonitor consults Swap.hasRecentClaimAttempt()
    // before retrying. Skipping sync is not the mechanism.
    if (!swap.isTerminal()) {
      await this.syncWithAtomiq(swap);
    }

    const txHash = swap.getTxHash();
    return {
      swap,
      status: swap.getStatus(),
      progress: swap.getProgress(),
      ...(txHash !== undefined && {txHash}),
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Persists the swap description to the transaction descriptions table
   * when the swap has a transaction hash.
   */
  private async persistDescription(swap: Swap): Promise<void> {
    const txHash = swap.getTxHash();
    if (txHash) {
      try {
        await this.deps.transactionRepository.saveDescription(
          TransactionHash.of(txHash),
          AccountId.of(swap.data.accountId),
          swap.data.description,
        );
      } catch {
        this.log.warn({swapId: swap.data.id}, 'Failed to persist description for swap');
      }
    }
  }

  /**
   * Syncs local swap state with Atomiq.
   * Atomiq is the source of truth — we transcribe its state without
   * checking local state coherence. Priority: completed > paid > failed > expired.
   * Protection against regressing a terminal swap is in fetchStatus() (isTerminal guard).
   */
  private async syncWithAtomiq(swap: Swap): Promise<void> {
    try {
      const atomiqStatus = await this.deps.atomiqGateway.getSwapStatus(swap.data.id, swap.data.direction);
      this.log.debug({atomiqStatus, direction: swap.data.direction}, 'Sync swap with Atomiq');

      if (atomiqStatus.isCompleted) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty txHash should fallback
        swap.markAsCompleted(atomiqStatus.txHash || 'unknown');
        await this.deps.swapRepository.save(swap);
        await this.persistDescription(swap);
      } else if (atomiqStatus.isClaimable) {
        swap.markAsClaimable();
        await this.deps.swapRepository.save(swap);
      } else if (atomiqStatus.isPaid) {
        swap.markAsPaid();
        await this.deps.swapRepository.save(swap);
      } else if (atomiqStatus.isRefundable) {
        swap.markAsRefundable();
        await this.deps.swapRepository.save(swap);
      } else if (atomiqStatus.isRefunded) {
        swap.markAsRefunded();
        await this.deps.swapRepository.save(swap);
      } else if (atomiqStatus.isFailed) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty error should fallback
        swap.markAsFailed(atomiqStatus.error || 'Unknown error');
        await this.deps.swapRepository.save(swap);
      } else if (atomiqStatus.isExpired) {
        // If the swap is not found in SDK storage (e.g. after container restart),
        // mark as 'lost' so the monitor stops polling — the refund can never be
        // detected without SDK data.
        if (atomiqStatus.error?.includes('not found in SDK storage')) {
          swap.markAsLost();
        } else {
          swap.markAsExpired();
        }
        await this.deps.swapRepository.save(swap);
      }
    } catch (error) {
      this.log.warn({
        swapId: swap.data.id,
        cause: error,
      }, 'Failed to sync swap with Atomiq');
    }
  }
}
