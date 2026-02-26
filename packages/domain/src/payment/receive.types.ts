import type {StarknetAddress} from '../account';
import type {StarknetCall} from '../ports/starknet.gateway';
import type {Amount} from '../shared';
import type {BitcoinAddress, LightningInvoice, SwapId} from '../swap';
import type {PaymentNetwork} from './types';

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
  useUriPrefix: boolean;
}

export interface ReceivePaymentInput {
  network: PaymentNetwork;
  destinationAddress: StarknetAddress;
  amount?: Amount;
  tokenAddress?: string;
  description: string;
  accountId: string;
  useUriPrefix: boolean;
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
 * Result of preparing a Bitcoin receive request (phase 1 of two-phase flow).
 * Contains the unsigned commit transactions that must be signed and submitted
 * before the Bitcoin deposit address becomes available.
 */
export interface BitcoinReceivePrepareResult {
  swapId: string;
  commitCalls: readonly StarknetCall[];
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
// RECEIVE Result (facade-level, discriminated union)
// =============================================================================

export type ReceiveResult =
  | ({network: 'starknet'} & StarknetReceiveResult)
  | ({network: 'lightning'} & LightningReceiveResult)
  | ({network: 'bitcoin'} & BitcoinReceiveResult)
  | ({network: 'bitcoin'; status: 'pending_commit'} & BitcoinReceivePrepareResult);
