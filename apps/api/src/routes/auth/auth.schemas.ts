import {Username} from "@bim/domain/account";
import {z} from 'zod';

// =============================================================================
// Validation Schemas
// =============================================================================

export const usernameSchema = z
  .string()
  .regex(
    Username.PATTERN,
    'Username must be 3-20 characters, alphanumeric and underscores only',
  );

export const BeginRegistrationSchema = z.object({
  username: usernameSchema,
});

export const CompleteRegistrationSchema = z.object({
  challengeId: z.string().uuid(),
  accountId: z.string().uuid(),
  username: usernameSchema,
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
    type: z.literal('public-key'),
  }),
});

//export const BeginAuthenticationSchema = z.object({});

export const CompleteAuthenticationSchema = z.object({
  challengeId: z.string().uuid(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal('public-key'),
  }),
});
