import type {StarknetAddress} from '../account';
import type {Amount} from '../shared';
import {ValidationError} from '../shared';
import type {BitcoinAddress} from './bitcoin-address';
import type {LightningInvoice} from './lightning-invoice';

// =============================================================================
// Branded Types
// =============================================================================

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

// =============================================================================
// Swap Direction
// =============================================================================

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

// =============================================================================
// Swap Status
// =============================================================================

export type SwapStatus =
  | 'pending'         // Swap created, waiting for payment
  | 'paid'            // Payment received (forward) or deposit detected (reverse)
  | 'confirming'      // Transaction submitted, waiting for confirmation
  | 'completed'       // Swap successfully completed
  | 'expired'         // Swap expired without completion
  | 'refunded'        // Security deposit automatically refunded after expiry
  | 'failed';         // Swap failed due to an error

// =============================================================================
// Swap State (Discriminated Union)
// =============================================================================

export type SwapState =
  | { status: 'pending' }
  | { status: 'paid'; paidAt: Date }
  | { status: 'confirming'; txHash: string; confirmedAt: Date }
  | { status: 'completed'; txHash: string; completedAt: Date }
  | { status: 'expired'; expiredAt: Date }
  | { status: 'refunded'; refundedAt: Date }
  | { status: 'failed'; error: string; failedAt: Date };

// =============================================================================
// Swap Creation Params
// =============================================================================

export interface CreateLightningToStarknetParams {
  id: SwapId;
  amount: Amount;
  destinationAddress: StarknetAddress;
  invoice: string;
  expiresAt: Date;
  description: string;
  accountId: string;
}

export interface CreateBitcoinToStarknetParams {
  id: SwapId;
  amount: Amount;
  destinationAddress: StarknetAddress;
  depositAddress: string;
  expiresAt: Date;
  description: string;
  accountId: string;
}

export interface CreateStarknetToLightningParams {
  id: SwapId;
  amount: Amount;
  sourceAddress: StarknetAddress;
  invoice: LightningInvoice;
  depositAddress: string;
  expiresAt: Date;
  description: string;
  accountId: string;
}

export interface CreateStarknetToBitcoinParams {
  id: SwapId;
  amount: Amount;
  sourceAddress: StarknetAddress;
  destinationAddress: BitcoinAddress;
  depositAddress: string;
  expiresAt: Date;
  description: string;
  accountId: string;
}

// =============================================================================
// Swap Limits
// =============================================================================

export interface SwapLimits {
  minSats: bigint;
  maxSats: bigint;
  feePercent: number;
}
