import {Amount, type BitcoinNetwork, DomainError, ErrorCode} from '../shared';
import type {SwapId, SwapStatus} from './types';

export class InvalidBitcoinAddressError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_BITCOIN_ADDRESS;

  constructor(readonly value: string) {
    super(`Invalid Bitcoin address format: ${value}`);
  }
}

export class BitcoinAddressNetworkMismatchError extends DomainError {
  readonly errorCode = ErrorCode.BITCOIN_ADDRESS_NETWORK_MISMATCH;

  constructor(
    readonly address: string,
    readonly expectedNetwork: BitcoinNetwork,
    readonly actualNetwork: BitcoinNetwork,
  ) {
    super(`Bitcoin address ${address} is for ${actualNetwork}, expected ${expectedNetwork}`);
  }

  override get args(): Record<string, string> {
    return {expectedNetwork: this.expectedNetwork, actualNetwork: this.actualNetwork};
  }
}

export class InvalidLightningInvoiceError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_LIGHTNING_INVOICE;

  constructor(readonly value: string) {
    super(`Invalid Lightning invoice format: ${value.substring(0, 20)}...`);
  }
}

export class LightningInvoiceExpiredError extends DomainError {
  readonly errorCode = ErrorCode.LIGHTNING_INVOICE_EXPIRED;

  constructor() {
    super('Lightning invoice has expired');
  }
}

export class SwapNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.SWAP_NOT_FOUND;

  constructor(readonly swapId: SwapId | string) {
    super(`Swap not found: ${swapId}`);
  }

  override get args(): Record<string, string> {
    return {swapId: String(this.swapId)};
  }
}

export class SwapExpiredError extends DomainError {
  readonly errorCode = ErrorCode.SWAP_EXPIRED;

  constructor(readonly swapId: SwapId) {
    super(`Swap expired: ${swapId}`);
  }

  override get args(): Record<string, string> {
    return {swapId: String(this.swapId)};
  }
}

export class InvalidSwapStateError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_SWAP_STATE;

  constructor(
    readonly currentStatus: SwapStatus,
    readonly attemptedAction: string,
  ) {
    super(`Cannot ${attemptedAction} swap in '${currentStatus}' status`);
  }

  override get args(): Record<string, string> {
    return {status: this.currentStatus, action: this.attemptedAction};
  }
}

export class SwapAmountError extends DomainError {
  private static readonly DEFAULT_MIN = 1_000n;
  private static readonly DEFAULT_MAX = 2_000_000n;

  readonly errorCode = ErrorCode.SWAP_AMOUNT_OUT_OF_RANGE;
  readonly amount: Amount;
  readonly min: Amount;
  readonly max: Amount;

  constructor(amount?: Amount, min?: Amount, max?: Amount) {
    const resolvedAmount = amount ?? Amount.zero();
    const resolvedMin = min !== undefined
      ? Amount.ofSatoshi(min.getSat() > SwapAmountError.DEFAULT_MIN ? min.getSat() : SwapAmountError.DEFAULT_MIN)
      : Amount.ofSatoshi(SwapAmountError.DEFAULT_MIN);
    const resolvedMax = max ?? Amount.ofSatoshi(SwapAmountError.DEFAULT_MAX);
    super(`Amount ${resolvedAmount.getSat()} sats is outside limits [${resolvedMin.getSat()}, ${resolvedMax.getSat()}]`);
    this.amount = resolvedAmount;
    this.min = resolvedMin;
    this.max = resolvedMax;
  }

  override get args(): Record<string, string | number> {
    return {
      amount: Number(this.amount.getSat()),
      min: Number(this.min.getSat()),
      max: Number(this.max.getSat()),
      unit: 'sats',
    };
  }
}

export class SwapCreationError extends DomainError {
  readonly errorCode = ErrorCode.SWAP_CREATION_FAILED;

  constructor(readonly reason: string) {
    super(`Failed to create swap: ${reason}`);
  }

  override get args(): Record<string, string> {
    return {reason: this.reason};
  }
}

export class SwapOwnershipError extends DomainError {
  readonly errorCode = ErrorCode.FORBIDDEN;

  constructor(readonly swapId: SwapId | string) {
    super(`Swap ${swapId} does not belong to this account`);
  }
}
