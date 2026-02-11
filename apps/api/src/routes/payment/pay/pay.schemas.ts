import {z} from 'zod';

// =============================================================================
// Validation Schemas
// =============================================================================

export const ParsePaymentSchema = z.object({
  paymentPayload: z.string().min(1),
});

export const ExecutePaymentSchema = z.object({
  paymentPayload: z.string().min(1),
  description: z.string().max(100).optional(),
});
