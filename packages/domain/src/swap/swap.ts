import {Amount, InvalidStateTransitionError} from '../shared';
import {
  type CreateBitcoinToStarknetParams,
  type CreateLightningToStarknetParams,
  type CreateStarknetToBitcoinParams,
  type CreateStarknetToLightningParams,
  InvalidSwapStateError,
  isForwardSwap,
  type SwapData,
  type SwapDirection,
  SwapId,
  type SwapState,
  type SwapStatus,
} from './types';

/**
 * Swap entity representing a cross-chain swap operation.
 *
 * Supports four swap directions:
 * - Lightning → Starknet (forward)
 * - Bitcoin → Starknet (forward)
 * - Starknet → Lightning (reverse)
 * - Starknet → Bitcoin (reverse)
 */
export class Swap {
  private state: SwapState;

  private constructor(
    readonly id: SwapId,
    readonly direction: SwapDirection,
    readonly amount: Amount,
    readonly destinationAddress: string,
    readonly sourceAddress: string | undefined,
    readonly invoice: string | undefined,
    readonly depositAddress: string | undefined,
    readonly expiresAt: Date,
    readonly createdAt: Date,
    state: SwapState,
    readonly description: string | undefined,
    readonly accountId: string | undefined,
  ) {
    this.state = state;
  }

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  /**
   * Creates a Lightning → Starknet swap.
   */
  static createLightningToStarknet(
    params: CreateLightningToStarknetParams,
  ): Swap {
    return new Swap(
      params.id,
      'lightning_to_starknet',
      params.amount,
      params.destinationAddress,
      undefined,
      params.invoice,
      undefined,
      params.expiresAt,
      new Date(),
      { status: 'pending' },
      params.description,
      params.accountId,
    );
  }

  /**
   * Creates a Bitcoin → Starknet swap.
   */
  static createBitcoinToStarknet(
    params: CreateBitcoinToStarknetParams,
  ): Swap {
    return new Swap(
      params.id,
      'bitcoin_to_starknet',
      params.amount,
      params.destinationAddress,
      undefined,
      undefined,
      params.depositAddress,
      params.expiresAt,
      new Date(),
      { status: 'pending' },
      params.description,
      params.accountId,
    );
  }

  /**
   * Creates a Starknet → Lightning swap.
   */
  static createStarknetToLightning(
    params: CreateStarknetToLightningParams,
  ): Swap {
    return new Swap(
      params.id,
      'starknet_to_lightning',
      params.amount,
      params.invoice, // destination is the LN invoice
      params.sourceAddress,
      params.invoice,
      params.depositAddress,
      params.expiresAt,
      new Date(),
      { status: 'pending' },
      params.description,
      params.accountId,
    );
  }

  /**
   * Creates a Starknet → Bitcoin swap.
   */
  static createStarknetToBitcoin(
    params: CreateStarknetToBitcoinParams,
  ): Swap {
    return new Swap(
      params.id,
      'starknet_to_bitcoin',
      params.amount,
      params.destinationAddress,
      params.sourceAddress,
      undefined,
      params.depositAddress,
      params.expiresAt,
      new Date(),
      { status: 'pending' },
      params.description,
      params.accountId,
    );
  }

  /**
   * Reconstitutes a Swap from persisted data.
   */
  static fromData(data: SwapData): Swap {
    return new Swap(
      data.id,
      data.direction,
      Amount.ofSatoshi(data.amountSats),
      data.destinationAddress,
      data.sourceAddress,
      data.invoice,
      data.depositAddress,
      data.expiresAt,
      data.createdAt,
      data.state,
      data.description,
      data.accountId,
    );
  }

  // ===========================================================================
  // State Accessors
  // ===========================================================================

  /**
   * Returns the current status of the swap.
   */
  getStatus(): SwapStatus {
    return this.state.status;
  }

  /**
   * Returns the full state of the swap.
   */
  getState(): SwapState {
    return this.state;
  }

  /**
   * Returns the transaction hash if available.
   */
  getTxHash(): string | undefined {
    if (this.state.status === 'confirming' || this.state.status === 'completed') {
      return this.state.txHash;
    }
    return undefined;
  }

  /**
   * Checks if this is a forward swap (into Starknet).
   */
  isForward(): boolean {
    return isForwardSwap(this.direction);
  }

  /**
   * Checks if the swap has expired.
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt || this.state.status === 'expired';
  }

  /**
   * Checks if the swap is in a terminal state.
   */
  isTerminal(): boolean {
    return ['completed', 'expired', 'failed'].includes(this.state.status);
  }

  /**
   * Checks if the swap can be claimed.
   */
  canClaim(): boolean {
    return this.state.status === 'paid' && !this.isExpired();
  }

  // ===========================================================================
  // State Transitions
  // ===========================================================================

  /**
   * Marks the swap as paid (payment received for forward swaps,
   * or deposit detected for reverse swaps).
   */
  markAsPaid(): void {
    if (this.state.status !== 'pending') {
      throw new InvalidStateTransitionError(this.state.status, 'paid');
    }
    if (this.isExpired()) {
      throw new InvalidSwapStateError(this.state.status, 'mark as paid (expired)');
    }
    this.state = {
      status: 'paid',
      paidAt: new Date(),
    };
  }

  /**
   * Marks the swap as confirming (claim transaction submitted).
   */
  markAsConfirming(txHash: string): void {
    if (this.state.status !== 'paid') {
      throw new InvalidStateTransitionError(this.state.status, 'confirming');
    }
    this.state = {
      status: 'confirming',
      txHash,
      confirmedAt: new Date(),
    };
  }

  /**
   * Marks the swap as completed.
   */
  markAsCompleted(txHash?: string): void {
    if (this.state.status !== 'confirming' && this.state.status !== 'paid') {
      throw new InvalidStateTransitionError(this.state.status, 'completed');
    }

    const finalTxHash =
      txHash ||
      (this.state.status === 'confirming' ? this.state.txHash : undefined);

    if (!finalTxHash) {
      throw new InvalidSwapStateError(
        this.state.status,
        'complete without transaction hash',
      );
    }

    this.state = {
      status: 'completed',
      txHash: finalTxHash,
      completedAt: new Date(),
    };
  }

  /**
   * Marks the swap as expired.
   */
  markAsExpired(): void {
    if (this.isTerminal()) {
      throw new InvalidStateTransitionError(this.state.status, 'expired');
    }
    this.state = {
      status: 'expired',
      expiredAt: new Date(),
    };
  }

  /**
   * Marks the swap as failed.
   */
  markAsFailed(error: string): void {
    if (this.isTerminal()) {
      throw new InvalidStateTransitionError(this.state.status, 'failed');
    }
    this.state = {
      status: 'failed',
      error,
      failedAt: new Date(),
    };
  }

  // ===========================================================================
  // Progress Calculation
  // ===========================================================================

  /**
   * Calculates the progress percentage (0-100).
   */
  getProgress(): number {
    switch (this.state.status) {
      case 'pending':
        return 0;
      case 'paid':
        return 33;
      case 'confirming':
        return 66;
      case 'completed':
        return 100;
      case 'expired':
      case 'failed':
        return 0;
    }
  }

  // ===========================================================================
  // Data Export
  // ===========================================================================

  /**
   * Exports the swap data for persistence.
   */
  toData(): SwapData {
    return {
      id: this.id,
      direction: this.direction,
      amountSats: this.amount.getSat(),
      destinationAddress: this.destinationAddress,
      sourceAddress: this.sourceAddress,
      state: this.state,
      invoice: this.invoice,
      depositAddress: this.depositAddress,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      description: this.description,
      accountId: this.accountId,
    };
  }
}
