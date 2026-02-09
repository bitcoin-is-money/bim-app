import {UuidCodec} from '@bim/lib/encoding';
import {
  type CredentialCreationOptions,
  type CredentialRequestOptions,
  WebauthnVirtualAuthenticator
} from '@bim/test-toolkit/auth';
import type {
  BeginAuthenticationResponse,
  BeginRegistrationResponse,
  CompleteRegistrationResponse
} from '../../src/routes';

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal request interface shared by TestApp.request() and TestnetApp.request().
 */
export interface TestRequester {
  get(path: string, init?: RequestInit): Response | Promise<Response>;
  post(path: string, body?: unknown, init?: RequestInit): Response | Promise<Response>;
}

/**
 * Result of a full registration flow.
 */
export interface RegisterResult {
  sessionCookie: string;
  account: CompleteRegistrationResponse['account'];
  completeResponse: Response;
}

// =============================================================================
// Constants
// =============================================================================

const WEBAUTHN_ORIGIN = 'http://localhost:8080';

// =============================================================================
// Conversion helpers
// =============================================================================

/**
 * Converts the API registration-begin response to the format expected by WebauthnVirtualAuthenticator.
 */
export function toRegistrationOptions(apiResponse: BeginRegistrationResponse): CredentialCreationOptions {
  return {
    challenge: apiResponse.options.challenge,
    rp: {
      id: apiResponse.options.rpId,
      name: apiResponse.options.rpName,
    },
    user: {
      id: UuidCodec.toBase64Url(apiResponse.options.userId),
      name: apiResponse.options.userName,
      displayName: apiResponse.options.userName,
    },
    origin: WEBAUTHN_ORIGIN,
  };
}

/**
 * Converts the API authentication-begin response to the format expected by WebauthnVirtualAuthenticator.
 */
export function toAuthenticationOptions(
  apiResponse: BeginAuthenticationResponse,
  rpId: string,
): CredentialRequestOptions {
  return {
    challenge: apiResponse.options.challenge,
    rpId,
    allowCredentials: apiResponse.options.allowCredentials,
    origin: WEBAUTHN_ORIGIN,
  };
}

// =============================================================================
// Cookie extraction
// =============================================================================

/**
 * Extracts the session cookie value from a Set-Cookie response header.
 */
export function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get('Set-Cookie') || '';
  const match = /session=([^;]+)/.exec(setCookie);
  return match ? `session=${match[1]}` : '';
}

// =============================================================================
// Registration flow
// =============================================================================

/**
 * Performs a full WebAuthn registration flow (begin → createCredential → complete).
 * Works with both TestApp and TestnetApp requesters.
 */
export async function registerUser(
  requester: TestRequester,
  authenticator: WebauthnVirtualAuthenticator,
  username: string,
): Promise<RegisterResult> {
  const beginResponse = await requester.post('/api/auth/register/begin', {username});
  const beginBody = await beginResponse.json() as BeginRegistrationResponse;

  const credential = await authenticator.createCredential(toRegistrationOptions(beginBody));

  const completeResponse = await requester.post('/api/auth/register/complete', {
    challengeId: beginBody.challengeId,
    accountId: beginBody.accountId,
    username,
    credential,
  });

  const completeBody = await completeResponse.clone().json() as CompleteRegistrationResponse;
  const sessionCookie = extractSessionCookie(completeResponse);

  return {
    sessionCookie,
    account: completeBody.account,
    completeResponse,
  };
}
