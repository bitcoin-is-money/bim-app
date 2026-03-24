import {z} from 'zod';

export const ReceiveSchema = z.object({
  network: z.enum(['lightning', 'bitcoin', 'starknet']),
  amount: z.string().regex(/^\d+$/, 'Amount must be a non-negative integer string').optional(),
  description: z.string().max(100).optional(),
  useUriPrefix: z.boolean().default(true),
});

const WebAuthnAssertionSchema = z.object({
  authenticatorData: z.string().min(1),
  clientDataJSON: z.string().min(1),
  signature: z.string().min(1),
});

export const ReceiveCommitSchema = z.object({
  buildId: z.uuid(),
  assertion: WebAuthnAssertionSchema,
});

/** Validated body for POST /api/receive */
export type ReceiveBody = z.infer<typeof ReceiveSchema>;
/** Validated body for POST /api/receive/commit */
export type ReceiveCommitBody = z.infer<typeof ReceiveCommitSchema>;

/** API response for a Starknet receive request. */
export interface StarknetReceiveResponse {
  network: 'starknet';
  address: string;
  uri: string;
}

/** API response for a Lightning receive request. */
export interface LightningReceiveResponse {
  network: 'lightning';
  swapId: string;
  invoice: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

/** API response for a completed Bitcoin receive request. */
export interface BitcoinReceiveResponse {
  network: 'bitcoin';
  swapId: string;
  depositAddress: string;
  bip21Uri: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

/**
 * Bitcoin receive requires a two-phase flow:
 * Phase 1 (POST /receive): Returns commit data for WebAuthn signing.
 * Phase 2 (POST /receive/commit): After signing, returns the deposit address.
 */
export interface BitcoinReceivePendingCommitResponse {
  network: 'bitcoin';
  status: 'pending_commit';
  buildId: string;
  messageHash: string;
  credentialId: string;
  swapId: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

/** API response from POST /api/receive/commit */
export type BitcoinReceiveCommitResponse = BitcoinReceiveResponse;

/** Discriminated union of all receive responses. */
export type ReceiveResponse =
  | StarknetReceiveResponse
  | LightningReceiveResponse
  | BitcoinReceiveResponse
  | BitcoinReceivePendingCommitResponse;
