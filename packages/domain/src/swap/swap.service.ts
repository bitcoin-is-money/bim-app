
import type {Logger} from 'pino';
import {AccountId, StarknetAddress} from '../account';
import type {AtomiqGateway, SwapRepository, TransactionRepository} from '../ports';
import {Amount} from '../shared';
import {TransactionHash} from '../user/types';
import {Swap} from './swap';
import {
  BitcoinAddress,
  InvalidSwapStateError,
  LightningInvoice,
  SwapAmountError,
  SwapClaimError,
  SwapCreationError,
  type SwapDirection,
  SwapId,
  type SwapLimits,
  SwapNotFoundError,
  type SwapStatus,
} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface SwapServiceDeps {
  swapRepository: SwapRepository;
  atomiqGateway: AtomiqGateway;
  transactionRepository: TransactionRepository;
  logger: Logger;
}

// =============================================================================
// Input/Output Types - Lightning → Starknet
// =============================================================================

export interface CreateLightningToStarknetInput {
  amount: Amount;
  destinationAddress: string;
  description?: string;
  accountId?: string;
}

export interface CreateLightningToStarknetOutput {
  swap: Swap;
  invoice: string;
}

// =============================================================================
// Input/Output Types - Bitcoin → Starknet
// =============================================================================

export interface CreateBitcoinToStarknetInput {
  amount: Amount;
  destinationAddress: string;
  description?: string;
  accountId?: string;
}

export interface CreateBitcoinToStarknetOutput {
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
  description?: string;
  accountId?: string;
}

export interface CreateStarknetToLightningOutput {
  swap: Swap;
  depositAddress: string;
  amount: Amount;
}

// =============================================================================
// Input/Output Types - Starknet → Bitcoin
// =============================================================================

export interface CreateStarknetToBitcoinInput {
  amount: Amount;
  destinationAddress: string;
  sourceAddress: string;
  description?: string;
  accountId?: string;
}

export interface CreateStarknetToBitcoinOutput {
  swap: Swap;
  depositAddress: string;
}

// =============================================================================
// Input/Output Types - Status & Limits & Claim
// =============================================================================

export interface FetchSwapStatusInput {
  swapId: string;
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

export interface ClaimSwapInput {
  swapId: string;
}

export interface ClaimSwapOutput {
  swap: Swap;
  txHash: string;
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
   * Creates a Bitcoin → Starknet swap.
   * User sends BTC to a deposit address, receives tokens on Starknet.
   *
   * @throws SwapAmountError if amount is outside limits
   * @throws SwapCreationError if deposit address generation fails
   */
  async createBitcoinToStarknet(
    input: CreateBitcoinToStarknetInput,
  ): Promise<CreateBitcoinToStarknetOutput> {
    this.log.debug({input}, 'Creating Bitcoin-to-Starknet swap');
    const destinationAddress = StarknetAddress.of(input.destinationAddress);

    // Validate amount against limits
    const limits = await this.deps.atomiqGateway.getBitcoinToStarknetLimits();
    this.validateAmountAgainstLimits(input.amount, limits);

    // Create swap via Atomiq (port uses bigint)
    const atomiqSwap = await this.deps.atomiqGateway.createBitcoinToStarknetSwap({
      amountSats: input.amount.getSat(),
      destinationAddress,
    });

    if (!atomiqSwap.depositAddress) {
      throw new SwapCreationError('Failed to generate Bitcoin deposit address');
    }

    const swap = Swap.createBitcoinToStarknet({
      id: SwapId.of(atomiqSwap.swapId),
      amount: input.amount,
      destinationAddress,
      depositAddress: atomiqSwap.depositAddress,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    this.log.info({
        swapId: atomiqSwap.swapId,
        amountSats: input.amount.toSatString()
      },'Bitcoin-to-Starknet swap created');
    return {
      swap,
      depositAddress: atomiqSwap.depositAddress,
      bip21Uri: atomiqSwap.bip21Uri || `bitcoin:${atomiqSwap.depositAddress}`,
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

    if (!atomiqSwap.depositAddress) {
      throw new SwapCreationError('Failed to generate Starknet deposit address');
    }

    // Convert from port bigint to Amount, then validate
    const swapAmount = Amount.ofSatoshi(atomiqSwap.amountSats);
    this.validateAmountAgainstLimits(swapAmount, limits);

    const swap = Swap.createStarknetToLightning({
      id: SwapId.of(atomiqSwap.swapId),
      amount: swapAmount,
      sourceAddress,
      invoice,
      depositAddress: atomiqSwap.depositAddress,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    this.log.info({
      swapId: atomiqSwap.swapId,
      amountSats: swapAmount.toSatString()
    }, 'Starknet-to-Lightning swap created');
    return {
      swap,
      depositAddress: atomiqSwap.depositAddress,
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
    const destinationAddress = BitcoinAddress.of(input.destinationAddress);
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

    if (!atomiqSwap.depositAddress) {
      throw new SwapCreationError('Failed to generate Starknet deposit address');
    }

    const swap = Swap.createStarknetToBitcoin({
      id: SwapId.of(atomiqSwap.swapId),
      amount: input.amount,
      sourceAddress,
      destinationAddress,
      depositAddress: atomiqSwap.depositAddress,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    this.log.info({
      swapId: atomiqSwap.swapId,
      amountSats: input.amount.toSatString()
    }, 'Starknet-to-Bitcoin swap created');
    return {
      swap,
      depositAddress: atomiqSwap.depositAddress,
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

    const swap = await this.deps.swapRepository.findById(swapId);
    if (!swap) {
      throw new SwapNotFoundError(swapId);
    }

    // Sync with Atomiq if not in the terminal state
    if (!swap.isTerminal()) {
      await this.syncWithAtomiq(swap);
    }

    return {
      swap,
      status: swap.getStatus(),
      progress: swap.getProgress(),
      txHash: swap.getTxHash(),
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
  // Claim
  // ===========================================================================

  /**
   * Claims a swap after payment has been received.
   * Triggers the final transfer to the destination address.
   *
   * @throws SwapNotFoundError if swap doesn't exist
   * @throws InvalidSwapStateError if swap cannot be claimed
   * @throws SwapClaimError if claim fails
   */
  async claim(input: ClaimSwapInput): Promise<ClaimSwapOutput> {
    const swapId = SwapId.of(input.swapId);

    const swap = await this.deps.swapRepository.findById(swapId);
    if (!swap) {
      throw new SwapNotFoundError(swapId);
    }

    if (!swap.canClaim()) {
      throw new InvalidSwapStateError(swap.getStatus(), 'claim');
    }

    try {
      this.log.info({swapId: swap.id}, 'Claiming swap');
      const result = await this.deps.atomiqGateway.claimSwap(swapId);

      swap.markAsConfirming(result.txHash);
      await this.deps.swapRepository.save(swap);

      // Wait for confirmation asynchronously
      this.waitForClaimConfirmation(swap, result.txHash);

      return {swap, txHash: result.txHash};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      swap.markAsFailed(message);
      await this.deps.swapRepository.save(swap);
      throw new SwapClaimError(swapId, message);
    }
  }

  // ===========================================================================
  // Active Swaps
  // ===========================================================================

  /**
   * Returns all non-terminal swaps (pending, paid, confirming).
   * Used by SwapMonitor to know which swaps to check.
   */
  async getActiveSwaps(): Promise<Swap[]> {
    return this.deps.swapRepository.findActive();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Persists the swap description to the transaction descriptions table if the swap has
   * a description, an accountId, and a transaction hash.
   */
  private async persistDescriptionIfNeeded(swap: Swap): Promise<void> {
    const txHash = swap.getTxHash();
    if (swap.description && swap.accountId && txHash) {
      try {
        await this.deps.transactionRepository.saveDescription(
          TransactionHash.of(txHash),
          AccountId.of(swap.accountId),
          swap.description,
        );
      } catch {
        this.log.warn({swapId: swap.id}, 'Failed to persist description for swap');
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
      const atomiqStatus = await this.deps.atomiqGateway.getSwapStatus(swap.id);
      this.log.debug({atomiqStatus}, 'Sync swap with Atomiq');

      if (atomiqStatus.isCompleted) {
        swap.markAsCompleted(atomiqStatus.txHash || 'unknown');
        await this.deps.swapRepository.save(swap);
        await this.persistDescriptionIfNeeded(swap);
      } else if (atomiqStatus.isPaid) {
        swap.markAsPaid();
        await this.deps.swapRepository.save(swap);
      } else if (atomiqStatus.isFailed) {
        swap.markAsFailed(atomiqStatus.error || 'Unknown error');
        await this.deps.swapRepository.save(swap);
      } else if (atomiqStatus.isExpired) {
        swap.markAsExpired();
        await this.deps.swapRepository.save(swap);
      }
    } catch (error) {
      this.log.warn({
        swapId: swap.id,
        cause: error,
      }, 'Failed to sync swap with Atomiq');
    }
  }

  /**
   * Waits for on-chain confirmation and updates swap status.
   */
  private async waitForClaimConfirmation(swap: Swap, txHash: string): Promise<void> {
    try {
      await this.deps.atomiqGateway.waitForClaimConfirmation(swap.id);
      swap.markAsCompleted(txHash);
      await this.deps.swapRepository.save(swap);
      await this.persistDescriptionIfNeeded(swap);
    } catch {
      // Don't mark as failed - let the monitor handle the final state
    }
  }
}
