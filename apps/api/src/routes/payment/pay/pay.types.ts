import {z} from 'zod';

export const ParsePaymentSchema = z.object({
  paymentPayload: z.string().min(1),
});

export const BuildPaymentSchema = z.object({
  paymentPayload: z.string().min(1),
  description: z.string().max(100).optional(),
});

const WebAuthnAssertionSchema = z.object({
  authenticatorData: z.string().min(1),
  clientDataJSON: z.string().min(1),
  signature: z.string().min(1),
});

export const ExecuteSignedPaymentSchema = z.object({
  buildId: z.uuid(),
  assertion: WebAuthnAssertionSchema,
});

/** Validated body for POST /api/pay/parse */
export type ParsePaymentBody = z.infer<typeof ParsePaymentSchema>;
/** Validated body for POST /api/pay/build */
export type BuildPaymentBody = z.infer<typeof BuildPaymentSchema>;
/** Validated body for POST /api/pay/execute */
export type ExecuteSignedPaymentBody = z.infer<typeof ExecuteSignedPaymentSchema>;

/** Serialized amount in API responses. */
export interface AmountResponse {
  value: number;
  currency: string;
}

/** Prepared Lightning payment details returned by POST /api/pay/parse */
export interface LightningPreparedPaymentResponse {
  network: 'lightning';
  amount: AmountResponse;
  amountEditable: boolean;
  fee: AmountResponse;
  description: string;
  invoice: string;
  expiresAt?: string;
}

/** Prepared Bitcoin payment details returned by POST /api/pay/parse */
export interface BitcoinPreparedPaymentResponse {
  network: 'bitcoin';
  amount: AmountResponse;
  amountEditable: boolean;
  fee: AmountResponse;
  description: string;
  address: string;
}

/** Prepared Starknet payment details returned by POST /api/pay/parse */
export interface StarknetPreparedPaymentResponse {
  network: 'starknet';
  amount: AmountResponse;
  amountEditable: boolean;
  fee: AmountResponse;
  description: string;
  address: string;
  tokenAddress: string;
}

/** Discriminated union of all prepared payment responses. */
export type PreparedPaymentResponse =
  | LightningPreparedPaymentResponse
  | BitcoinPreparedPaymentResponse
  | StarknetPreparedPaymentResponse;

/** Result of a Lightning payment execution. */
export interface LightningPaymentResultResponse {
  network: 'lightning';
  txHash: string;
  amount: AmountResponse;
  swapId: string;
  invoice: string;
  expiresAt: string;
}

/** Result of a Bitcoin payment execution. */
export interface BitcoinPaymentResultResponse {
  network: 'bitcoin';
  txHash: string;
  amount: AmountResponse;
  swapId: string;
  destinationAddress: string;
  expiresAt: string;
}

/** Result of a Starknet payment execution. */
export interface StarknetPaymentResultResponse {
  network: 'starknet';
  txHash: string;
  amount: AmountResponse;
  feeAmount: AmountResponse;
  recipientAddress: string;
  tokenAddress: string;
}

/** Discriminated union of all payment execution results. */
export type PaymentResultResponse =
  | LightningPaymentResultResponse
  | BitcoinPaymentResultResponse
  | StarknetPaymentResultResponse;

/** API response from POST /api/pay/build */
export interface BuildPaymentResponse {
  buildId: string;
  /** Starknet message hash as hex string (0x-prefixed), used as WebAuthn challenge */
  messageHash: string;
  /** Account's credential ID (base64url-encoded) for WebAuthn allowCredentials */
  credentialId: string;
  /** Parsed payment info for display */
  payment: PreparedPaymentResponse;
}
