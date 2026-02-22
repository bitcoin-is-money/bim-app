import {z} from 'zod';

// =============================================================================
// Validation Schemas
// =============================================================================

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

/** @deprecated Use BuildPaymentSchema + ExecuteSignedPaymentSchema */
export const ExecutePaymentSchema = z.object({
  paymentPayload: z.string().min(1),
  description: z.string().max(100).optional(),
});
