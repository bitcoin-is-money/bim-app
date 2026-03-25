import type {Amount, BitcoinAddress, StarknetAddress} from '../shared';
import {ValidationError} from '../shared';
import type {LightningInvoice} from './lightning-invoice';

/**
 * Unique identifier for a Swap.
 */
export type SwapId = string & { readonly __brand: 'SwapId' };

export namespace SwapId {
  export function of(value: string): SwapId {
    if (!value || value.length === 0) {
      throw new ValidationError('swapId', 'cannot be empty');
    }
    return value as SwapId;
  }

  export function generate(): SwapId {
    return crypto.randomUUID() as SwapId;
  }
}

/** All supported swap directions. */
export type SwapDirection =
  | 'lightning_to_starknet'
  | 'bitcoin_to_starknet'
  | 'starknet_to_lightning'
  | 'starknet_to_bitcoin';

export function isForwardSwap(direction: SwapDirection): boolean {
  return direction === 'lightning_to_starknet' || direction === 'bitcoin_to_starknet';
}

export function isReverseSwap(direction: SwapDirection): boolean {
  return direction === 'starknet_to_lightning' || direction === 'starknet_to_bitcoin';
}

/** Lifecycle status of a swap. */
export type SwapStatus =
  | 'pending'
  | 'paid'
  | 'confirming'
  | 'completed'
  | 'expired'
  | 'refunded'
  | 'failed'
  | 'lost';

/** Discriminated union encoding the full swap state (status + associated data). */
export type SwapState =
  | { status: 'pending' }
  | { status: 'paid'; paidAt: Date }
  | { status: 'confirming'; txHash: string; confirmedAt: Date }
  | { status: 'completed'; txHash: string; completedAt: Date }
  | { status: 'expired'; expiredAt: Date }
  | { status: 'refunded'; refundedAt: Date }
  | { status: 'failed'; error: string; failedAt: Date }
  | { status: 'lost'; lostAt: Date };

/** Fields common to all swap directions. */
export interface SwapBase {
  readonly id: SwapId;
  readonly amount: Amount;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly description: string;
  readonly accountId: string;
}

/**
 * Discriminated union of swap data per direction.
 * Each variant carries only the fields relevant to its direction,
 * ensuring compile-time safety (no `string | undefined` ambiguity).
 */
export type SwapData = SwapBase & (
  | {
      readonly direction: 'lightning_to_starknet';
      readonly destinationAddress: StarknetAddress;
      readonly invoice: string;
    }
  | {
      readonly direction: 'bitcoin_to_starknet';
      readonly destinationAddress: StarknetAddress;
      readonly depositAddress: string;
    }
  | {
      readonly direction: 'starknet_to_lightning';
      readonly sourceAddress: StarknetAddress;
      readonly destinationAddress: string;
      readonly invoice: LightningInvoice;
      readonly depositAddress: string;
    }
  | {
      readonly direction: 'starknet_to_bitcoin';
      readonly sourceAddress: StarknetAddress;
      readonly destinationAddress: BitcoinAddress;
      readonly depositAddress: string;
    }
);

/** Swap limits returned by the Atomiq gateway. */
export interface SwapLimits {
  minSats: bigint;
  maxSats: bigint;
  feePercent: number;
}
