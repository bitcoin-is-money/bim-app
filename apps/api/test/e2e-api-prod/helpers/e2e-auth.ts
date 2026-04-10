import {UuidCodec} from '@bim/lib/encoding';
import type {
  CredentialCreationOptions,
  CredentialRequestOptions,
  WebauthnVirtualAuthenticator
} from '@bim/test-toolkit/auth';
import type {
  BeginAuthenticationResponse,
  BeginRegistrationResponse,
  CompleteRegistrationResponse,
} from '../../../src/routes';
import type {E2eClient} from './e2e-client.js';

// =============================================================================
// Types
// =============================================================================

export interface RegisterResult {
  sessionCookie: string;
  account: CompleteRegistrationResponse['account'];
}

// =============================================================================
// Origin / RP ID from env
// =============================================================================

function getWebAuthnOrigin(): string {
  const origin = process.env.WEBAUTHN_ORIGIN;
  if (!origin) {
    throw new Error('WEBAUTHN_ORIGIN is not set — is .env.e2e-api-prod loaded?');
  }
  return origin;
}

// =============================================================================
// Conversion helpers
// =============================================================================

function toRegistrationOptions(apiResponse: BeginRegistrationResponse): CredentialCreationOptions {
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
    origin: getWebAuthnOrigin(),
  };
}

function toAuthenticationOptions(
  apiResponse: BeginAuthenticationResponse,
  rpId: string,
): CredentialRequestOptions {
  const allowCredentials = apiResponse.options.allowCredentials;
  return {
    challenge: apiResponse.options.challenge,
    rpId,
    ...(allowCredentials !== undefined && {allowCredentials}),
    origin: getWebAuthnOrigin(),
  };
}

// =============================================================================
// Cookie extraction
// =============================================================================

export function extractSessionCookie(response: Response): string {
  // Node.js fetch merges Set-Cookie headers in .get(), use .getSetCookie() instead
  const cookies = response.headers.getSetCookie();
  for (const cookie of cookies) {
    const match = /session=([^;]+)/.exec(cookie);
    if (match) {
      return `session=${match[1]}`;
    }
  }
  return '';
}

// =============================================================================
// Registration flow
// =============================================================================

/**
 * Performs a full WebAuthn registration flow against the production API.
 *
 * Uses the WEBAUTHN_ORIGIN from env to match the production server's expected origin.
 */
export async function registerUser(
  client: E2eClient,
  authenticator: WebauthnVirtualAuthenticator,
  username: string,
): Promise<RegisterResult> {
  const beginResponse = await client.post('/api/auth/register/begin', {username});
  if (beginResponse.status !== 200) {
    const body = await beginResponse.text();
    throw new Error(`Register begin failed (HTTP ${beginResponse.status}): ${body}`);
  }

  const beginBody = await beginResponse.json() as BeginRegistrationResponse;
  const credential = await authenticator.createCredential(toRegistrationOptions(beginBody));

  const completeResponse = await client.post('/api/auth/register/complete', {
    challengeId: beginBody.challengeId,
    accountId: beginBody.accountId,
    username,
    credential,
  });

  if (completeResponse.status !== 200) {
    const body = await completeResponse.text();
    throw new Error(`Register complete failed (HTTP ${completeResponse.status}): ${body}`);
  }

  const completeBody = await completeResponse.clone().json() as CompleteRegistrationResponse;
  const sessionCookie = extractSessionCookie(completeResponse);

  if (!sessionCookie) {
    throw new Error('No session cookie returned after registration');
  }

  return {
    sessionCookie,
    account: completeBody.account,
  };
}

// =============================================================================
// Authentication flow
// =============================================================================

/**
 * Performs a full WebAuthn authentication flow against the production API.
 *
 * The authenticator must already have a credential for the target RP ID
 * (created during a previous registerUser call in the same test run).
 */
export async function loginUser(
  client: E2eClient,
  authenticator: WebauthnVirtualAuthenticator,
): Promise<{sessionCookie: string}> {
  const beginResponse = await client.post('/api/auth/login/begin', {});
  if (beginResponse.status !== 200) {
    const body = await beginResponse.text();
    throw new Error(`Login begin failed (HTTP ${beginResponse.status}): ${body}`);
  }

  const beginBody = await beginResponse.json() as BeginAuthenticationResponse;
  const rpId = process.env.WEBAUTHN_RP_ID ?? 'localhost';
  const credential = await authenticator.getAssertion(toAuthenticationOptions(beginBody, rpId));

  const completeResponse = await client.post('/api/auth/login/complete', {
    challengeId: beginBody.challengeId,
    credential,
  });

  if (completeResponse.status !== 200) {
    const body = await completeResponse.text();
    throw new Error(`Login complete failed (HTTP ${completeResponse.status}): ${body}`);
  }

  const sessionCookie = extractSessionCookie(completeResponse);

  if (!sessionCookie) {
    throw new Error('No session cookie returned after login');
  }

  return {sessionCookie};
}
