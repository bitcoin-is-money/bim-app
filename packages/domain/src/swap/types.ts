import {StarknetAddress} from '../account/types';
import {DomainError, ValidationError} from '../shared/errors';

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

/**
 * Lightning Network invoice (BOLT11 format).
 */
export type LightningInvoice = string & { readonly __brand: 'LightningInvoice' };

export namespace LightningInvoice {
  const INVOICE_REGEX = /^(lnbc|lntb|lnbcrt)[a-z0-9]+$/i;

  export function of(value: string): LightningInvoice {
    const trimmed = value.trim().toLowerCase();
    if (!INVOICE_REGEX.test(trimmed)) {
      throw new InvalidLightningInvoiceError(value);
    }
    return trimmed as LightningInvoice;
  }

  export function isValid(value: string): boolean {
    return INVOICE_REGEX.test(value.trim());
  }
}

/**
 * Bitcoin address (supports Bech32 and legacy formats).
 */
export type BitcoinAddress = string & { readonly __brand: 'BitcoinAddress' };

export namespace BitcoinAddress {
  // Bech32 mainnet (bc1) and testnet (tb1)
  const BECH32_REGEX = /^(bc1|tb1)[a-z0-9]{39,87}$/i;
  // Legacy P2PKH and P2SH
  const LEGACY_REGEX = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  // Testnet legacy
  const TESTNET_LEGACY_REGEX = /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

  export function of(value: string): BitcoinAddress {
    const trimmed = value.trim();
    if (
      !BECH32_REGEX.test(trimmed) &&
      !LEGACY_REGEX.test(trimmed) &&
      !TESTNET_LEGACY_REGEX.test(trimmed)
    ) {
      throw new InvalidBitcoinAddressError(value);
    }
    return trimmed as BitcoinAddress;
  }

  export function isValid(value: string): boolean {
    const trimmed = value.trim();
    return (
      BECH32_REGEX.test(trimmed) ||
      LEGACY_REGEX.test(trimmed) ||
      TESTNET_LEGACY_REGEX.test(trimmed)
    );
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
  | { status: 'failed'; error: string; failedAt: Date };

// =============================================================================
// Swap Data DTOs
// =============================================================================

export interface SwapData {
  id: SwapId;
  direction: SwapDirection;
  amountSats: bigint;
  destinationAddress: string;
  sourceAddress?: string;
  state: SwapState;
  invoice?: string;
  depositAddress?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateLightningToStarknetParams {
  id: SwapId;
  amountSats: bigint;
  destinationAddress: StarknetAddress;
  invoice: string;
  expiresAt: Date;
}

export interface CreateBitcoinToStarknetParams {
  id: SwapId;
  amountSats: bigint;
  destinationAddress: StarknetAddress;
  depositAddress: string;
  expiresAt: Date;
}

export interface CreateStarknetToLightningParams {
  id: SwapId;
  amountSats: bigint;
  sourceAddress: StarknetAddress;
  invoice: LightningInvoice;
  depositAddress: string;
  expiresAt: Date;
}

export interface CreateStarknetToBitcoinParams {
  id: SwapId;
  amountSats: bigint;
  sourceAddress: StarknetAddress;
  destinationAddress: BitcoinAddress;
  depositAddress: string;
  expiresAt: Date;
}

// =============================================================================
// Swap Limits
// =============================================================================

export interface SwapLimits {
  minSats: bigint;
  maxSats: bigint;
  feePercent: number;
}

// =============================================================================
// Errors
// =============================================================================

export class InvalidLightningInvoiceError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid Lightning invoice format: ${value.substring(0, 20)}...`);
  }
}

export class InvalidBitcoinAddressError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid Bitcoin address format: ${value}`);
  }
}

export class SwapNotFoundError extends DomainError {
  constructor(readonly swapId: SwapId | string) {
    super(`Swap not found: ${swapId}`);
  }
}

export class SwapExpiredError extends DomainError {
  constructor(readonly swapId: SwapId) {
    super(`Swap expired: ${swapId}`);
  }
}

export class InvalidSwapStateError extends DomainError {
  constructor(
    readonly currentStatus: SwapStatus,
    readonly attemptedAction: string,
  ) {
    super(`Cannot ${attemptedAction} swap in '${currentStatus}' status`);
  }
}

export class SwapAmountError extends DomainError {
  constructor(
    readonly amount: bigint,
    readonly min: bigint,
    readonly max: bigint,
  ) {
    super(`Amount ${amount} sats is outside limits [${min}, ${max}]`);
  }
}

export class SwapCreationError extends DomainError {
  constructor(readonly reason: string) {
    super(`Failed to create swap: ${reason}`);
  }
}

export class SwapClaimError extends DomainError {
  constructor(
    readonly swapId: SwapId,
    readonly reason: string,
  ) {
    super(`Failed to claim swap ${swapId}: ${reason}`);
  }
}
