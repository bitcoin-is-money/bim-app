import {z} from 'zod';

// =============================================================================
// Validation Schemas
// =============================================================================

export const ParsePaymentSchema = z.object({
  data: z.string().min(1),
});

export const ExecutePaymentSchema = z.object({
  data: z.string().min(1),
});
