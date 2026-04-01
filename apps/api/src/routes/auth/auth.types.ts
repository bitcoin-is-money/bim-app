import {Username} from '@bim/domain/account';
import {z} from 'zod';

export const usernameSchema = z
  .string()
  .regex(
    Username.PATTERN,
    'Username must be 3-25 characters, alphanumeric and underscores only',
  );

export const BeginRegistrationSchema = z.object({
  username: usernameSchema,
});

export const CompleteRegistrationSchema = z.object({
  challengeId: z.uuid(),
  accountId: z.uuid(),
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

export const CompleteAuthenticationSchema = z.object({
  challengeId: z.uuid(),
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

/** Validated body for POST /api/auth/register/begin */
export type BeginRegistrationBody = z.infer<typeof BeginRegistrationSchema>;
/** Validated body for POST /api/auth/register/complete */
export type CompleteRegistrationBody = z.infer<typeof CompleteRegistrationSchema>;
/** Validated body for POST /api/auth/login/complete */
export type CompleteAuthenticationBody = z.infer<typeof CompleteAuthenticationSchema>;

/** API response from POST /api/auth/register/begin */
export interface BeginRegistrationResponse {
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeoutMs: number;
  };
  challengeId: string;
  accountId: string;
}

/** API response from POST /api/auth/register/complete */
export interface CompleteRegistrationResponse {
  account: {
    id: string;
    username: string;
    starknetAddress: string | null;
    status: string;
  };
}

/** API response from POST /api/auth/login/begin */
export interface BeginAuthenticationResponse {
  options: {
    challenge: string;
    rpId: string;
    allowCredentials?: {
      id: string;
      type: 'public-key';
    }[];
    timeoutMs: number;
    userVerification: 'required' | 'preferred' | 'discouraged';
  };
  challengeId: string;
}

/** API response from POST /api/auth/login/complete (same as registration) */
export type CompleteAuthenticationResponse = CompleteRegistrationResponse;

/** API response from GET /api/auth/session (authenticated) */
export interface SessionAuthenticatedResponse {
  authenticated: true;
  account: {
    id: string;
    username: string;
    starknetAddress: string | null;
    status: string;
  };
}

/** API response from GET /api/auth/session (not authenticated) */
export interface SessionUnauthenticatedResponse {
  authenticated: false;
}

/** API response from GET /api/auth/session */
export type SessionResponse = SessionAuthenticatedResponse | SessionUnauthenticatedResponse;

/** API response from POST /api/auth/logout */
export interface LogoutResponse {
  success: true;
}
