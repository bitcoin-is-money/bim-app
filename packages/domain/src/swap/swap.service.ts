
import type {Logger} from 'pino';
import {AccountId} from '../account';
import type {AtomiqGateway, StarknetCall, SwapRepository, TransactionRepository} from '../ports';
import {Amount, BitcoinAddress, type BitcoinNetwork, StarknetAddress} from '../shared';
import {TransactionHash} from '../user/types';
import {Swap} from './swap';
import {SwapAmountError, SwapCreationError, SwapNotFoundError, SwapOwnershipError} from './errors';
import {LightningInvoice} from './lightning-invoice';
import {type SwapDirection, SwapId, type SwapLimits, type SwapStatus} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface SwapServiceDeps {
  swapRepository: SwapRepository;
  atomiqGateway: AtomiqGateway;
  transactionRepository: TransactionRepository;
  bitcoinNetwork: BitcoinNetwork;
  logger: Logger;
}

// =============================================================================
// Input/Output Types - Lightning → Starknet
// =============================================================================

export interface CreateLightningToStarknetInput {
  amount: Amount;
  destinationAddress: string;
  description: string;
  accountId: string;
}

export interface CreateLightningToStarknetOutput {
  swap: Swap;
  invoice: string;
}

// =============================================================================
// Input/Output Types - Bitcoin → Starknet
// =============================================================================

export interface PrepareBitcoinToStarknetInput {
  amount: Amount;
  destinationAddress: string;
  description: string;
  accountId: string;
}

export interface PrepareBitcoinToStarknetOutput {
  swapId: string;
  commitCalls: readonly StarknetCall[];
  amount: Amount;
  expiresAt: Date;
}

export interface SaveBitcoinCommitInput {
  swapId: string;
  destinationAddress: string;
  amount: Amount;
  description: string;
  accountId: string;
  commitTxHash: string;
  expiresAt: Date;
}

export interface CompleteBitcoinToStarknetInput {
  swapId: string;
}

export interface CompleteBitcoinToStarknetOutput {
  swap: Swap;
  depositAddress: string;
  bip21Uri: string;
}

// =============================================================================
// Input/Output Types - Starknet → Lightning
// =============================================================================

export interface CreateStarknetToLightningInput {
  invoice: string;
  sourceAddress: string;
  description: string;
  accountId: string;
}

export interface CreateStarknetToLightningOutput {
  swap: Swap;
  commitCalls: readonly StarknetCall[];
  amount: Amount;
}

// =============================================================================
// Input/Output Types - Starknet → Bitcoin
// =============================================================================

export interface CreateStarknetToBitcoinInput {
  amount: Amount;
  destinationAddress: string;
  sourceAddress: string;
  description: string;
  accountId: string;
}

export interface CreateStarknetToBitcoinOutput {
  swap: Swap;
  commitCalls: readonly StarknetCall[];
  amount: Amount;
}

// =============================================================================
// Input/Output Types - Status & Limits & Claim
// =============================================================================

export interface FetchSwapStatusInput {
  swapId: string;
  accountId: string;
}

export interface FetchSwapStatusOutput {
  swap: Swap;
  status: SwapStatus;
  progress: number;
  txHash?: string;
}

export interface FetchSwapLimitsInput {
  direction: SwapDirection;
}

export interface FetchSwapLimitsOutput {
  limits: SwapLimits;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for cross-chain swap operations.
 * Supports Lightning ↔ Starknet and Bitcoin ↔ Starknet swaps.
 */
export class SwapService {
  private readonly log: Logger;

  constructor(private readonly deps: SwapServiceDeps) {
    this.log = deps.logger.child({name: 'swap.service.ts'});
  }

  // ===========================================================================
  // Forward Swaps (Receive on Starknet)
  // ===========================================================================

  /**
   * Creates a Lightning → Starknet swap.
   * User pays a Lightning invoice, receives tokens on Starknet.
   *
   * @throws SwapAmountError if amount is outside limits
   * @throws SwapCreationError if invoice generation fails
   */
  async createLightningToStarknet(
    input: CreateLightningToStarknetInput,
  ): Promise<CreateLightningToStarknetOutput> {
    this.log.debug({input}, 'Creating Lightning-to-Starknet swap');

    const destinationAddress = StarknetAddress.of(input.destinationAddress);

    // Validate amount against limits
    const limits = await this.deps.atomiqGateway.getLightningToStarknetLimits();
    this.validateAmountAgainstLimits(input.amount, limits);

    // Create swap via Atomiq (port uses bigint)
    const atomiqSwap = await this.deps.atomiqGateway.createLightningToStarknetSwap({
      amountSats: input.amount.getSat(),
      destinationAddress,
      description: input.description,
    });

    if (!atomiqSwap.invoice) {
      throw new SwapCreationError('Failed to generate Lightning invoice');
    }

    const swap = Swap.createLightningToStarknet({
      id: SwapId.of(atomiqSwap.swapId),
      amount: input.amount,
      destinationAddress,
      invoice: atomiqSwap.invoice,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    this.log.info({
      swapId: atomiqSwap.swapId,
      amountSats: input.amount.toSatString()
    }, 'Lightning-to-Starknet swap created');
    return {swap, invoice: atomiqSwap.invoice};
  }

  /**
   * Prepares a Bitcoin → Starknet swap (phase 1 of two-phase flow).
   * Creates the swap quote and returns unsigned Starknet commit transactions.
   * The caller must sign and submit these before calling completeBitcoinToStarknet.
   *
   * @throws SwapAmountError if amount is outside limits
   * @throws SwapCreationError if swap preparation fails
   */
  async prepareBitcoinToStarknet(
    input: PrepareBitcoinToStarknetInput,
  ): Promise<PrepareBitcoinToStarknetOutput> {
    this.log.debug({input}, 'Preparing Bitcoin-to-Starknet swap');
    const destinationAddress = StarknetAddress.of(input.destinationAddress);

    // Validate amount against limits
    const limits = await this.deps.atomiqGateway.getBitcoinToStarknetLimits();
    this.validateAmountAgainstLimits(input.amount, limits);

    // Create swap quote + get unsigned commit transactions
    const quote = await this.deps.atomiqGateway.prepareBitcoinToStarknetSwap({
      amountSats: input.amount.getSat(),
      destinationAddress,
    });

    this.log.info({
      swapId: quote.swapId,
      commitCallsCount: quote.commitCalls.length,
      amountSats: input.amount.toSatString(),
    }, 'Bitcoin-to-Starknet swap prepared (pending commit)');

    return {
      swapId: quote.swapId,
      commitCalls: quote.commitCalls,
      amount: input.amount,
      expiresAt: quote.expiresAt,
    };
  }

  /**
   * Saves a Bitcoin → Starknet swap to the database immediately after the
   * on-chain commit is confirmed. This ensures the SwapMonitor can track the
   * swap even if subsequent steps (completeBitcoinSwapCommit) fail.
   *
   * The swap is created in 'committed' state without a deposit address.
   */
  async saveBitcoinCommit(input: SaveBitcoinCommitInput): Promise<Swap> {
    this.log.debug({swapId: input.swapId, commitTxHash: input.commitTxHash}, 'Saving Bitcoin commit to DB');
    const destinationAddress = StarknetAddress.of(input.destinationAddress);

    const swap = Swap.createBitcoinToStarknetCommitted({
      id: SwapId.of(input.swapId),
      amount: input.amount,
      destinationAddress,
      commitTxHash: input.commitTxHash,
      expiresAt: input.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    this.log.info({swapId: input.swapId, commitTxHash: input.commitTxHash}, 'Bitcoin commit saved to DB (committed state)');
    return swap;
  }

  /**
   * Completes a Bitcoin → Starknet swap (phase 2 of two-phase flow).
   * Called after the commit is saved to DB. Waits for the SDK to detect the
   * on-chain commit, then updates the swap with the Bitcoin deposit address.
   *
   * @throws SwapNotFoundError if the swap doesn't exist in DB
   * @throws SwapCreationError if the commit was not detected or address retrieval fails
   */
  async completeBitcoinToStarknet(
    input: CompleteBitcoinToStarknetInput,
  ): Promise<CompleteBitcoinToStarknetOutput> {
    const swapId = SwapId.of(input.swapId);
    this.log.debug({swapId}, 'Completing Bitcoin-to-Starknet swap after commit');

    const swap = await this.deps.swapRepository.findById(swapId);
    if (!swap) {
      throw new SwapNotFoundError(swapId);
    }

    // Wait for SDK to detect the on-chain commit and get the deposit address
    const result = await this.deps.atomiqGateway.completeBitcoinSwapCommit(input.swapId);

    if (!result.depositAddress) {
      throw new SwapCreationError('Failed to retrieve Bitcoin deposit address after commit');
    }

    swap.setDepositAddress(result.depositAddress);
    swap.markAsPaid();
    await this.deps.swapRepository.save(swap);

    this.log.info({
      swapId: input.swapId,
      depositAddress: result.depositAddress,
    }, 'Bitcoin-to-Starknet swap completed (deposit address available)');

    return {
      swap,
      depositAddress: result.depositAddress,
      bip21Uri: result.bip21Uri,
    };
  }

  // ===========================================================================
  // Reverse Swaps (Send from Starknet)
  // ===========================================================================

  /**
   * Creates a Starknet → Lightning swap.
   * User deposits tokens on Starknet, receives payment on Lightning.
   *
   * @throws SwapAmountError if invoice amount is outside limits
   * @throws SwapCreationError if deposit address generation fails
   */
  async createStarknetToLightning(
    input: CreateStarknetToLightningInput,
  ): Promise<CreateStarknetToLightningOutput> {
    this.log.debug({input}, 'Creating Starknet-to-Lightning swap');
    const invoice = LightningInvoice.of(input.invoice);
    const sourceAddress = StarknetAddress.of(input.sourceAddress);

    const limits = await this.deps.atomiqGateway.getStarknetToLightningLimits();

    // Create swap (invoice determines amount)
    const atomiqSwap = await this.deps.atomiqGateway.createStarknetToLightningSwap({
      invoice,
      sourceAddress,
    });

    if (atomiqSwap.commitCalls.length === 0) {
      throw new SwapCreationError('Failed to generate escrow commit calls');
    }

    // Convert from port bigint to Amount, then validate
    const swapAmount = Amount.ofSatoshi(atomiqSwap.amountSats);
    this.validateAmountAgainstLimits(swapAmount, limits);

    const swap = Swap.createStarknetToLightning({
      id: SwapId.of(atomiqSwap.swapId),
      amount: swapAmount,
      sourceAddress,
      invoice,
      depositAddress: atomiqSwap.commitCalls[0]!.contractAddress,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    const logMsg = 'Starknet-to-Lightning swap created';
    if (this.log.isLevelEnabled("debug")) {
      this.log.debug({
        swapId: atomiqSwap.swapId,
        amountSats: swapAmount.toSatString()
      }, logMsg);
    } else {
      this.log.info(logMsg);
    }

    return {
      swap,
      commitCalls: atomiqSwap.commitCalls,
      amount: swapAmount,
    };
  }

  /**
   * Creates a Starknet → Bitcoin swap.
   * User deposits tokens on Starknet, receives BTC on-chain.
   *
   * @throws SwapAmountError if amount is outside limits
   * @throws SwapCreationError if deposit address generation fails
   */
  async createStarknetToBitcoin(
    input: CreateStarknetToBitcoinInput,
  ): Promise<CreateStarknetToBitcoinOutput> {
    this.log.debug({input}, 'Creating Starknet-to-Bitcoin swap');
    const destinationAddress = BitcoinAddress.of(input.destinationAddress, this.deps.bitcoinNetwork);
    const sourceAddress = StarknetAddress.of(input.sourceAddress);

    // Validate amount against limits
    const limits = await this.deps.atomiqGateway.getStarknetToBitcoinLimits();
    this.validateAmountAgainstLimits(input.amount, limits);

    // Create swap via Atomiq (port uses bigint)
    const atomiqSwap = await this.deps.atomiqGateway.createStarknetToBitcoinSwap({
      amountSats: input.amount.getSat(),
      destinationAddress,
      sourceAddress,
    });

    if (atomiqSwap.commitCalls.length === 0) {
      throw new SwapCreationError('Failed to generate escrow commit calls');
    }

    const swap = Swap.createStarknetToBitcoin({
      id: SwapId.of(atomiqSwap.swapId),
      amount: input.amount,
      sourceAddress,
      destinationAddress,
      depositAddress: atomiqSwap.commitCalls[0]!.contractAddress,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    const swapAmount = Amount.ofSatoshi(atomiqSwap.amountSats);

    this.log.info({
      swapId: atomiqSwap.swapId,
      amountSats: swapAmount.toSatString()
    }, 'Starknet-to-Bitcoin swap created');
    return {
      swap,
      commitCalls: atomiqSwap.commitCalls,
      amount: swapAmount,
    };
  }

  // ===========================================================================
  // Status & Limits
  // ===========================================================================

  /**
   * Fetches the current status of a swap.
   * Syncs with Atomiq if the swap is not in a terminal state.
   *
   * @throws SwapNotFoundError if swap doesn't exist
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
    // Double-claim is prevented orthogonally by SwapMonitor via
    // recordClaimAttempt / hasRecentClaimAttempt, not by skipping sync.
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

  /**
   * Fetches min/max amounts and fees for a given swap direction.
   */
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

  // ===========================================================================
  // Claim Lifecycle
  // ===========================================================================

  /**
   * Records that the SwapMonitor submitted a claim transaction for this swap.
   * This is metadata only — the swap status remains `claimable` until Atomiq
   * reflects the on-chain result via syncWithAtomiq. The monitor uses
   * `hasRecentClaimAttempt()` on the returned swap to throttle re-submissions.
   */
  async recordClaimAttempt(swapId: string, txHash: string): Promise<void> {
    const id = SwapId.of(swapId);
    const swap = await this.deps.swapRepository.findById(id);
    if (!swap) {
      throw new SwapNotFoundError(id);
    }
    swap.recordClaimAttempt(txHash);
    await this.deps.swapRepository.save(swap);
    await this.persistDescription(swap);
  }

  // ===========================================================================
  // Active Swaps
  // ===========================================================================

  /**
   * Returns all non-terminal swaps (pending, committed, paid, claimable).
   * Used by SwapMonitor to know which swaps to check.
   */
  async getActiveSwaps(): Promise<Swap[]> {
    return this.deps.swapRepository.findActive();
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
   * Validates that an amount is within the gateway limits.
   * Converts limits from bigint (port boundary) to Amount for comparison.
   */
  private validateAmountAgainstLimits(amount: Amount, limits: SwapLimits): void {
    const min = Amount.ofSatoshi(limits.minSats);
    const max = Amount.ofSatoshi(limits.maxSats);
    if (amount.isLessThan(min) || amount.isGreaterThan(max)) {
      throw new SwapAmountError(amount, min, max);
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
