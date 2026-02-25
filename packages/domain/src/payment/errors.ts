import {DomainError} from '../shared';
import type {PaymentNetwork} from './types';

export class PaymentParsingError extends DomainError {
  constructor(readonly cause: Error) {
    super(`Failed to parse payment data: ${cause.message}`);
  }
}

export class InvalidPaymentAmountError extends DomainError {
  constructor(
    readonly network: PaymentNetwork,
    readonly amount: bigint
  ) {
    super(`${network} payment detected, but with invalid payment amount: ${amount} sats. Must be greater than 0.`);
  }
}

export class SameAddressPaymentError extends DomainError {
  constructor() {
    super('Cannot send payment to the same address as the sender.');
  }
}

export class UnsupportedNetworkError extends DomainError {
  constructor(readonly data: string) {
    super(`Unsupported network: cannot identify "${data.substring(0, 50)}"`);
  }
}

export class MissingPaymentAmountError extends DomainError {
  constructor(readonly network: PaymentNetwork) {
    super(`${network} payment detected, but the amount has not been set`);
  }
}

export class UnsupportedTokenError extends DomainError {
  constructor(readonly tokenAddress: string) {
    super(`Unsupported token: "${tokenAddress}". Only WBTC is supported.`);
  }
}

export class InvalidPaymentAddressError extends DomainError {
  constructor(
    readonly network: PaymentNetwork,
    readonly address: string,
  ) {
    super(`${network} payment detected, but invalid address: "${address}"`);
  }
}
