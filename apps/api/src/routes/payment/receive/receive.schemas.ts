import {z} from 'zod';

// =============================================================================
// Validation Schemas
// =============================================================================

export const ReceiveSchema = z.object({
  network: z.enum(['lightning', 'bitcoin', 'starknet']),
  amount: z.string().optional(),
  tokenAddress: z.string().optional(),
  description: z.string().max(100).optional(),
});
