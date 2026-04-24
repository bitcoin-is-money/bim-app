import type {Logger} from 'pino';
import {AccountId} from '../../account';
import type {AtomiqGateway, StarknetCall, SwapRepository, TransactionRepository} from '../../ports';
import {Amount, BitcoinAddress, type BitcoinNetwork, StarknetAddress} from '../../shared';
import {TransactionHash} from '../../user/types';
import {SwapAmountError, SwapCreationError, SwapNotFoundError} from '../errors';
import {LightningInvoice} from '../lightning-invoice';
import {Swap} from '../swap';
import {SwapId, type SwapLimits} from '../types';

export interface SwapCoordinatorDeps {
  swapRepository: SwapRepository;
  atomiqGateway: AtomiqGateway;
  transactionRepository: TransactionRepository;
  bitcoinNetwork: BitcoinNetwork;
  logger: Logger;
}

// =============================================================================
// Input/Output Types — Lightning → Starknet
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
// Input/Output Types — Bitcoin → Starknet
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
// Input/Output Types — Starknet → Lightning
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
// Input/Output Types — Starknet → Bitcoin
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
// Service
// =============================================================================

/**
 * Internal domain service that orchestrates the full swap lifecycle with
 * Atomiq: creation (both directions for Lightning and Bitcoin), Bitcoin
 * commit + complete (2-phase receive), claim tracking, and active-swap
 * listing for the SwapMonitor.
 *
 * No primary-port (UseCase) interface — consumed by payment services
 * (PaymentBuilder, PaymentReceiver, BitcoinReceiver) and the SwapMonitor.
 */
export class SwapCoordinator {
  private readonly log: Logger;

  constructor(private readonly deps: SwapCoordinatorDeps) {
    this.log = deps.logger.child({name: 'swap-coordinator.service.ts'});
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

    const limits = await this.deps.atomiqGateway.getLightningToStarknetLimits();
    this.validateAmountAgainstLimits(input.amount, limits);

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
      amountSats: input.amount.toSatString(),
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

    const limits = await this.deps.atomiqGateway.getBitcoinToStarknetLimits();
    this.validateAmountAgainstLimits(input.amount, limits);

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

    const atomiqSwap = await this.deps.atomiqGateway.createStarknetToLightningSwap({
      invoice,
      sourceAddress,
    });

    const [firstCommitCall] = atomiqSwap.commitCalls;
    if (!firstCommitCall) {
      throw new SwapCreationError('Failed to generate escrow commit calls');
    }

    const swapAmount = Amount.ofSatoshi(atomiqSwap.amountSats);
    this.validateAmountAgainstLimits(swapAmount, limits);

    const swap = Swap.createStarknetToLightning({
      id: SwapId.of(atomiqSwap.swapId),
      amount: swapAmount,
      sourceAddress,
      invoice,
      depositAddress: firstCommitCall.contractAddress,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    const logMsg = 'Starknet-to-Lightning swap created';
    if (this.log.isLevelEnabled('debug')) {
      this.log.debug({
        swapId: atomiqSwap.swapId,
        amountSats: swapAmount.toSatString(),
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

    const limits = await this.deps.atomiqGateway.getStarknetToBitcoinLimits();
    this.validateAmountAgainstLimits(input.amount, limits);

    const atomiqSwap = await this.deps.atomiqGateway.createStarknetToBitcoinSwap({
      amountSats: input.amount.getSat(),
      destinationAddress,
      sourceAddress,
    });

    const [firstCommitCall] = atomiqSwap.commitCalls;
    if (!firstCommitCall) {
      throw new SwapCreationError('Failed to generate escrow commit calls');
    }

    const swap = Swap.createStarknetToBitcoin({
      id: SwapId.of(atomiqSwap.swapId),
      amount: input.amount,
      sourceAddress,
      destinationAddress,
      depositAddress: firstCommitCall.contractAddress,
      expiresAt: atomiqSwap.expiresAt,
      description: input.description,
      accountId: input.accountId,
    });

    await this.deps.swapRepository.save(swap);

    const swapAmount = Amount.ofSatoshi(atomiqSwap.amountSats);

    this.log.info({
      swapId: atomiqSwap.swapId,
      amountSats: swapAmount.toSatString(),
    }, 'Starknet-to-Bitcoin swap created');
    return {
      swap,
      commitCalls: atomiqSwap.commitCalls,
      amount: swapAmount,
    };
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

  private validateAmountAgainstLimits(amount: Amount, limits: SwapLimits): void {
    const min = Amount.ofSatoshi(limits.minSats);
    const max = Amount.ofSatoshi(limits.maxSats);
    if (amount.isLessThan(min) || amount.isGreaterThan(max)) {
      throw new SwapAmountError(amount, min, max);
    }
  }
}
