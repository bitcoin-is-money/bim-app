import {type StarknetAddress} from '../account';
import {Amount, DomainError} from '../shared';
import {type BitcoinAddress, type LightningInvoice, type SwapId, type SwapStatus} from '../swap';

// =============================================================================
// Payment Network
// =============================================================================

export type PaymentNetwork = 'lightning' | 'bitcoin' | 'starknet';

// =============================================================================
// Parsed Payment Data (result of parsing QR codes, invoices, addresses)
// =============================================================================

export type ParsedPaymentData =
  | {
      network: 'lightning';
      amount: Amount;
      description: string;
      invoice: LightningInvoice;
      expiresAt?: Date;
    }
  | {
      network: 'bitcoin';
      amount: Amount;
      description: string;
      address: BitcoinAddress;
    }
  | {
      network: 'starknet';
      amount: Amount;
      description: string;
      address: StarknetAddress;
      tokenAddress: string;
    };

// =============================================================================
// Prepared Payment (parsed data + calculated fee)
// =============================================================================

export type PreparedPayment = ParsedPaymentData & { fee: Amount };

// =============================================================================
// PAY Inputs
// =============================================================================

export interface PayStarknetInput {
  senderAddress: StarknetAddress;
  recipientAddress: StarknetAddress;
  tokenAddress: string;
  amount: Amount;
}

export interface PayLightningInput {
  invoice: LightningInvoice;
  senderAddress: StarknetAddress;
}

export interface PayBitcoinInput {
  address: BitcoinAddress;
  amount: Amount;
  senderAddress: StarknetAddress;
}

// =============================================================================
// RECEIVE Inputs
// =============================================================================

export interface ReceiveLightningInput {
  destinationAddress: StarknetAddress;
  amount: Amount;
}

export interface ReceiveBitcoinInput {
  destinationAddress: StarknetAddress;
  amount: Amount;
}

export interface ReceiveStarknetInput {
  starknetAddress: StarknetAddress;
  amount?: Amount;
  tokenAddress?: string;
}

// =============================================================================
// PAY Results
// =============================================================================

/**
 * Result of executing a Starknet payment.
 */
export interface StarknetPaymentResult {
  txHash: string;
  amount: Amount;
  feeAmount: Amount;
  recipientAddress: StarknetAddress;
  tokenAddress: string;
}

/**
 * Result of executing a Lightning payment.
 * The WBTC deposit has been submitted; the swap is being processed.
 */
export interface LightningPaymentResult {
  txHash: string;
  swapId: SwapId;
  invoice: LightningInvoice;
  amount: Amount;
  expiresAt: Date;
}

/**
 * Result of executing a Bitcoin payment.
 * The WBTC deposit has been submitted; the swap is being processed.
 */
export interface BitcoinPaymentResult {
  txHash: string;
  swapId: SwapId;
  amount: Amount;
  destinationAddress: BitcoinAddress;
  expiresAt: Date;
}

// =============================================================================
// RECEIVE Results
// =============================================================================

/**
 * Result of creating a Lightning receive request.
 * Contains the invoice to display as QR code.
 */
export interface LightningReceiveResult {
  swapId: SwapId;
  invoice: LightningInvoice;
  amount: Amount;
  expiresAt: Date;
}

/**
 * Result of creating a Bitcoin receive request.
 * Contains the deposit address to display as QR code.
 */
export interface BitcoinReceiveResult {
  swapId: SwapId;
  depositAddress: BitcoinAddress;
  bip21Uri: string;
  amount: Amount;
  expiresAt: Date;
}

/**
 * Result of creating a Starknet receive request.
 * Contains the address and a starknet: URI for QR display.
 */
export interface StarknetReceiveResult {
  address: StarknetAddress;
  uri: string;
}

// =============================================================================
// STATUS
// =============================================================================

export interface PaymentStatusResult {
  status: SwapStatus;
  progress: number;
  txHash?: string;
}

// =============================================================================
// Errors
// =============================================================================

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
