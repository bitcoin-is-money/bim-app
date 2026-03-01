import {z} from 'zod';

// =============================================================================
// Validation Schemas
// =============================================================================

export const ReceiveSchema = z.object({
  network: z.enum(['lightning', 'bitcoin', 'starknet']),
  amount: z.string().regex(/^\d+$/, 'Amount must be a non-negative integer string').optional(),
  tokenAddress: z.string().optional(),
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
