
/**
 * Serialized amount in the API response.
 */
export interface AmountResponse {
  value: number;
  currency: string;
}

// =============================================================================
// POST /api/pay/parse
// =============================================================================

export interface LightningPreparedPaymentResponse {
  network: 'lightning';
  amount: AmountResponse;
  fee: AmountResponse;
  description: string;
  invoice: string;
  expiresAt?: string;
}

export interface BitcoinPreparedPaymentResponse {
  network: 'bitcoin';
  amount: AmountResponse;
  fee: AmountResponse;
  description: string;
  address: string;
}

export interface StarknetPreparedPaymentResponse {
  network: 'starknet';
  amount: AmountResponse;
  fee: AmountResponse;
  description: string;
  address: string;
  tokenAddress: string;
}

export type PreparedPaymentResponse =
  | LightningPreparedPaymentResponse
  | BitcoinPreparedPaymentResponse
  | StarknetPreparedPaymentResponse;

// =============================================================================
// POST /api/pay/execute
// =============================================================================

export interface LightningPaymentResultResponse {
  network: 'lightning';
  txHash: string;
  amount: AmountResponse;
  swapId: string;
  invoice: string;
  expiresAt: string;
}

export interface BitcoinPaymentResultResponse {
  network: 'bitcoin';
  txHash: string;
  amount: AmountResponse;
  swapId: string;
  destinationAddress: string;
  expiresAt: string;
}

export interface StarknetPaymentResultResponse {
  network: 'starknet';
  txHash: string;
  amount: AmountResponse;
  feeAmount: AmountResponse;
  recipientAddress: string;
  tokenAddress: string;
}

export type PaymentResultResponse =
  | LightningPaymentResultResponse
  | BitcoinPaymentResultResponse
  | StarknetPaymentResultResponse;

// =============================================================================
// POST /api/pay/build
// =============================================================================

export interface BuildPaymentResponse {
  buildId: string;
  /** Starknet message hash as hex string (0x-prefixed), used as WebAuthn challenge */
  messageHash: string;
  /** Account's credential ID (base64url-encoded) for WebAuthn allowCredentials */
  credentialId: string;
  /** Parsed payment info for display */
  payment: PreparedPaymentResponse;
}
