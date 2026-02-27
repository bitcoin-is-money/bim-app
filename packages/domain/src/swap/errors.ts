import {type Amount, DomainError} from '../shared';
import type {SwapId, SwapStatus} from './types';

export class InvalidBitcoinAddressError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid Bitcoin address format: ${value}`);
  }
}

export class InvalidLightningInvoiceError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid Lightning invoice format: ${value.substring(0, 20)}...`);
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
    readonly amount: Amount,
    readonly min: Amount,
    readonly max: Amount,
  ) {
    super(`Amount ${amount.getSat()} sats is outside limits [${min.getSat()}, ${max.getSat()}]`);
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
