import type {Amount, BitcoinAddress, StarknetAddress} from '../shared';
import type {LightningInvoice} from '../swap';

// =============================================================================
// Payment Network
// =============================================================================

export type PaymentNetwork = 'lightning' | 'bitcoin' | 'starknet';

// =============================================================================
// WebAuthn Assertion (base64url-encoded raw data from navigator.credentials.get)
// =============================================================================

export interface WebAuthnAssertion {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

// =============================================================================
// Parsed Payment Data (result of parsing QR codes, invoices, addresses)
// =============================================================================

export type ParsedPaymentData =
  | {
      network: 'lightning';
      amount: Amount;
      amountEditable: boolean;
      description: string;
      invoice: LightningInvoice;
      expiresAt?: Date;
    }
  | {
      network: 'bitcoin';
      amount: Amount;
      amountEditable: boolean;
      description: string;
      address: BitcoinAddress;
    }
  | {
      network: 'starknet';
      amount: Amount;
      amountEditable: boolean;
      description: string;
      address: StarknetAddress;
      tokenAddress: StarknetAddress;
    };
