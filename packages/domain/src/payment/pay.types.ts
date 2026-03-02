import type {StarknetAddress} from '../account';
import type {StarknetCall} from '../ports/starknet.gateway';
import type {Amount} from '../shared';
import type {BitcoinAddress, LightningInvoice, SwapId} from '../swap';
import type {ParsedPaymentData} from './types';

// =============================================================================
// Prepared Calls (result of preparing payment calls before AVNU build)
// =============================================================================

export type PreparedCalls =
  | {
      network: 'starknet';
      calls: readonly StarknetCall[];
      amount: Amount;
      feeAmount: Amount;
      recipientAddress: StarknetAddress;
      tokenAddress: string;
    }
  | {
      network: 'lightning';
      calls: readonly StarknetCall[];
      amount: Amount;
      swapId: SwapId;
      invoice: LightningInvoice;
      expiresAt: Date;
    }
  | {
      network: 'bitcoin';
      calls: readonly StarknetCall[];
      amount: Amount;
      swapId: SwapId;
      destinationAddress: BitcoinAddress;
      expiresAt: Date;
    };

// =============================================================================
// Prepared Payment (parsed data + calculated fee)
// =============================================================================

export type PreparedPayment = ParsedPaymentData & { fee: Amount };

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
// EXECUTE Result (facade-level, discriminated union)
// =============================================================================

export type PaymentResult =
  | ({network: 'starknet'} & StarknetPaymentResult)
  | ({network: 'lightning'} & LightningPaymentResult)
  | ({network: 'bitcoin'} & BitcoinPaymentResult);
