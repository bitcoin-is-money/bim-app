import type {Amount, BitcoinAddress, StarknetAddress} from '../shared';
import {ValidationError} from '../shared';
import type {LightningInvoice} from './lightning-invoice';

import {
  isForwardSwap,
  type SwapData,
  type SwapDirection,
  type SwapState,
  type SwapStatus,
  type SwapId,
} from './types';

/**
 * Swap entity representing a cross-chain swap operation.
 *
 * Supports four swap directions:
 * - Lightning → Starknet (forward)
 * - Bitcoin → Starknet (forward)
 * - Starknet → Lightning (reverse)
 * - Starknet → Bitcoin (reverse)
 *
 * Direction-specific fields are encoded in the `data` discriminated union,
 * ensuring compile-time safety: accessing `invoice` requires narrowing on the direction first.
 */
export class Swap {
  private state: SwapState;

  constructor(
    readonly data: SwapData,
    state: SwapState,
  ) {
    this.state = state;
  }

  /** Creates a Lightning → Starknet swap. */
  static createLightningToStarknet(params: {
    id: SwapId;
    amount: Amount;
    destinationAddress: StarknetAddress;
    invoice: string;
    expiresAt: Date;
    description: string;
    accountId: string;
  }): Swap {
    return new Swap({
      direction: 'lightning_to_starknet',
      ...params,
      createdAt: new Date(),
    }, {status: 'pending'});
  }

  /** Creates a Bitcoin → Starknet swap with deposit address (full creation). */
  static createBitcoinToStarknet(params: {
    id: SwapId;
    amount: Amount;
    destinationAddress: StarknetAddress;
    depositAddress: string;
    expiresAt: Date;
    description: string;
    accountId: string;
  }): Swap {
    return new Swap({
      direction: 'bitcoin_to_starknet',
      ...params,
      createdAt: new Date(),
    }, {status: 'pending'});
  }

  /**
   * Creates a Bitcoin → Starknet swap right after the on-chain commit is confirmed,
   * before the deposit address is known. This ensures the swap is persisted in DB
   * immediately so the SwapMonitor can track it even if subsequent steps fail.
   */
  static createBitcoinToStarknetCommitted(params: {
    id: SwapId;
    amount: Amount;
    destinationAddress: StarknetAddress;
    commitTxHash: string;
    expiresAt: Date;
    description: string;
    accountId: string;
  }): Swap {
    return new Swap({
      direction: 'bitcoin_to_starknet',
      id: params.id,
      amount: params.amount,
      destinationAddress: params.destinationAddress,
      expiresAt: params.expiresAt,
      description: params.description,
      accountId: params.accountId,
      createdAt: new Date(),
    }, {status: 'committed', commitTxHash: params.commitTxHash, committedAt: new Date()});
  }

  /** Creates a Starknet → Lightning swap. */
  static createStarknetToLightning(params: {
    id: SwapId;
    amount: Amount;
    sourceAddress: StarknetAddress;
    invoice: LightningInvoice;
    depositAddress: string;
    expiresAt: Date;
    description: string;
    accountId: string;
  }): Swap {
    return new Swap({
      direction: 'starknet_to_lightning',
      destinationAddress: params.invoice,
      ...params,
      createdAt: new Date(),
    }, {status: 'pending'});
  }

  /** Creates a Starknet → Bitcoin swap. */
  static createStarknetToBitcoin(params: {
    id: SwapId;
    amount: Amount;
    sourceAddress: StarknetAddress;
    destinationAddress: BitcoinAddress;
    depositAddress: string;
    expiresAt: Date;
    description: string;
    accountId: string;
  }): Swap {
    return new Swap({
      direction: 'starknet_to_bitcoin',
      ...params,
      createdAt: new Date(),
    }, {status: 'pending'});
  }

  /** Returns the current status of the swap. */
  getStatus(): SwapStatus {
    return this.state.status;
  }

  /** Returns the full state of the swap. */
  getState(): SwapState {
    return this.state;
  }

  /** Returns the transaction hash if available. */
  getTxHash(): string | undefined {
    if (this.state.status === 'committed') {
      return this.state.commitTxHash;
    }
    if (this.state.status === 'confirming' || this.state.status === 'completed') {
      return this.state.txHash;
    }
    return undefined;
  }

  /** Checks if this is a forward swap (into Starknet). */
  isForward(): boolean {
    return isForwardSwap(this.data.direction);
  }

  /**
   * Checks if the swap has expired.
   * Expiration is determined solely by Atomiq (via syncWithAtomiq → markAsExpired).
   */
  isExpired(): boolean {
    return this.state.status === 'expired';
  }

  /** Checks if the swap is in a terminal state. */
  isTerminal(): boolean {
    // Expired bitcoin_to_starknet swaps are NOT terminal: the Atomiq smart contract
    // will auto-refund the security deposit after timelock expiry (state -3).
    if (this.state.status === 'expired' && this.data.direction === 'bitcoin_to_starknet') {
      return false;
    }
    return ['completed', 'expired', 'failed', 'refunded', 'lost'].includes(this.state.status);
  }

  /**
   * Sets the Bitcoin deposit address once it becomes available
   * (after completeBitcoinSwapCommit succeeds).
   */
  setDepositAddress(depositAddress: string): void {
    if (!depositAddress) {
      throw new ValidationError('depositAddress', 'cannot be empty');
    }
    if (this.data.direction !== 'bitcoin_to_starknet') return;
    // SwapData is readonly, but we need to update this one field after commit.
    // This is safe because we control the lifecycle.
    (this.data as { depositAddress: string }).depositAddress = depositAddress;
  }

  /**
   * All mark* methods are pure state setters — Atomiq is the source of truth.
   * We transcribe states, we don't validate transition coherence.
   */

  markAsCommitted(commitTxHash: string): void {
    this.state = { status: 'committed', commitTxHash, committedAt: new Date() };
  }

  markAsPaid(): void {
    this.state = { status: 'paid', paidAt: new Date() };
  }

  markAsClaimable(): void {
    this.state = { status: 'claimable', claimableAt: new Date() };
  }

  markAsConfirming(txHash: string): void {
    this.state = { status: 'confirming', txHash, confirmedAt: new Date() };
  }

  markAsCompleted(txHash: string): void {
    this.state = { status: 'completed', txHash, completedAt: new Date() };
  }

  markAsExpired(): void {
    this.state = { status: 'expired', expiredAt: new Date() };
  }

  markAsRefunded(): void {
    this.state = { status: 'refunded', refundedAt: new Date() };
  }

  markAsFailed(error: string): void {
    this.state = { status: 'failed', error, failedAt: new Date() };
  }

  markAsLost(): void {
    this.state = { status: 'lost', lostAt: new Date() };
  }

  /** Calculates the progress percentage (0-100). */
  getProgress(): number {
    switch (this.state.status) {
      case 'pending':
        return 0;
      case 'committed':
        return 10;
      case 'paid':
        return 33;
      case 'claimable':
        return 50;
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
