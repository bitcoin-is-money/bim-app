import {DomainError, ErrorCode} from '../shared';
import type {PaymentNetwork} from './types';

export class PaymentParsingError extends DomainError {
  readonly errorCode = ErrorCode.PAYMENT_PARSING_ERROR;

  constructor(cause: Error) {
    super(`Failed to parse payment data: ${cause.message}`, {cause});
  }
}

export class InvalidPaymentAmountError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_PAYMENT_AMOUNT;

  constructor(
    readonly network: PaymentNetwork,
    readonly amount: bigint
  ) {
    super(`${network} payment detected, but with invalid payment amount: ${amount} sats. Must be greater than 0.`);
  }

  override get args(): Record<string, string | number> {
    return {network: this.network, amount: Number(this.amount), unit: 'sats'};
  }
}

export class SameAddressPaymentError extends DomainError {
  readonly errorCode = ErrorCode.SAME_ADDRESS_PAYMENT;

  constructor() {
    super('Cannot send payment to the same address as the sender.');
  }
}

export class UnsupportedNetworkError extends DomainError {
  readonly errorCode = ErrorCode.UNSUPPORTED_NETWORK;

  constructor(
    readonly data: string,
    readonly detectedNetwork?: string,
  ) {
    const base = detectedNetwork
      ? `Unsupported network or format: ${detectedNetwork}`
      : `Unsupported network or format: cannot identify "${data.substring(0, 50)}"`;
    super(base);
  }

  override get args(): Record<string, string> | undefined {
    if (this.detectedNetwork !== undefined) {
      return {network: this.detectedNetwork};
    }
    return undefined;
  }
}

export class UnsupportedTokenError extends DomainError {
  readonly errorCode = ErrorCode.UNSUPPORTED_TOKEN;

  constructor(readonly tokenAddress: string) {
    super(`Unsupported token: "${tokenAddress}". Only WBTC is supported.`);
  }

  override get args(): Record<string, string> {
    return {token: this.tokenAddress};
  }
}

export class InvalidPaymentAddressError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_PAYMENT_ADDRESS;

  constructor(
    readonly network: PaymentNetwork,
    readonly address: string,
  ) {
    super(`${network} payment detected, but invalid address: "${address}"`);
  }
}
