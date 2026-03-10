import type {Amount} from '../shared';
import type {
  SwapId} from './types';
import {
  type CreateBitcoinToStarknetParams,
  type CreateLightningToStarknetParams,
  type CreateStarknetToBitcoinParams,
  type CreateStarknetToLightningParams,
  isForwardSwap,
  type SwapDirection,
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

  constructor(
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
    readonly description: string,
    readonly accountId: string,
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
   * Expiration is determined solely by Atomiq (via syncWithAtomiq → markAsExpired).
   * We never second-guess Atomiq with a local date check.
   */
  isExpired(): boolean {
    return this.state.status === 'expired';
  }

  /**
   * Checks if the swap is in a terminal state.
   */
  isTerminal(): boolean {
    // Expired bitcoin_to_starknet swaps are NOT terminal: the Atomiq smart contract
    // will auto-refund the security deposit after timelock expiry (state -3).
    // Keep monitoring until the refund is confirmed.
    if (this.state.status === 'expired' && this.direction === 'bitcoin_to_starknet') {
      return false;
    }
    return ['completed', 'expired', 'failed', 'refunded', 'lost'].includes(this.state.status);
  }

  // ===========================================================================
  // State Transitions
  // ===========================================================================

  /**
   * All mark* methods are pure state setters — Atomiq is the source of truth.
   * We transcribe states, we don't validate transition coherence.
   * Protection against regressing a terminal swap is in fetchStatus() (isTerminal guard).
   */

  markAsPaid(): void {
    this.state = {
      status: 'paid',
      paidAt: new Date(),
    };
  }

  markAsConfirming(txHash: string): void {
    this.state = {
      status: 'confirming',
      txHash,
      confirmedAt: new Date(),
    };
  }

  markAsCompleted(txHash: string): void {
    this.state = {
      status: 'completed',
      txHash,
      completedAt: new Date(),
    };
  }

  markAsExpired(): void {
    this.state = {
      status: 'expired',
      expiredAt: new Date(),
    };
  }

  markAsRefunded(): void {
    this.state = {
      status: 'refunded',
      refundedAt: new Date(),
    };
  }

  markAsFailed(error: string): void {
    this.state = {
      status: 'failed',
      error,
      failedAt: new Date(),
    };
  }

  markAsLost(): void {
    this.state = {
      status: 'lost',
      lostAt: new Date(),
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
      case 'refunded':
      case 'failed':
      case 'lost':
        return 0;
    }
  }

}
