import {z} from 'zod';

export const SwapDirectionSchema = z.enum([
  'lightning_to_starknet',
  'bitcoin_to_starknet',
  'starknet_to_lightning',
  'starknet_to_bitcoin',
]);

export const SwapIdParamSchema = z.string().min(1).max(200).regex(/^[\w-]+$/);

/** Validated swap direction path parameter. */
export type SwapDirection = z.infer<typeof SwapDirectionSchema>;
/** Validated swap ID path parameter. */
export type SwapIdParam = z.infer<typeof SwapIdParamSchema>;

/** API response from GET /api/swap/limits/:direction */
export interface SwapLimitsResponse {
  minSats: string;
  maxSats: string;
  feePercent: number;
}

/** API response from GET /api/swap/status/:swapId */
export interface SwapStatusResponse {
  swapId: string;
  direction: string;
  status: string;
  progress: number;
  txHash: string | undefined;
  amountSats: string;
  destinationAddress: string;
  expiresAt: string;
}
