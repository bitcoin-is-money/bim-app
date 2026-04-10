import type {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';

/**
 * WebAuthn assertion fields needed by /api/pay/execute and /api/receive/commit.
 */
export interface WebAuthnAssertion {
  authenticatorData: string;  // base64url
  clientDataJSON: string;     // base64url
  signature: string;          // base64url
}

/**
 * Signs a Starknet message hash using the virtual authenticator.
 *
 * Replicates what the frontend does:
 * 1. Convert hex messageHash to bytes
 * 2. Use bytes as WebAuthn challenge
 * 3. Get assertion from authenticator
 * 4. Return raw assertion fields for the API
 */
export async function signMessageHash(
  authenticator: WebauthnVirtualAuthenticator,
  messageHash: string,
  credentialId: string,
  rpId: string,
  origin: string,
): Promise<WebAuthnAssertion> {
  const challenge = hexToBase64Url(messageHash);

  const assertion = await authenticator.getAssertion({
    challenge,
    rpId,
    allowCredentials: [{id: credentialId, type: 'public-key'}],
    origin,
  });

  return {
    authenticatorData: assertion.response.authenticatorData,
    clientDataJSON: assertion.response.clientDataJSON,
    signature: assertion.response.signature,
  };
}

/**
 * Converts a 0x-prefixed hex string to base64url.
 * Matches the frontend's hexToBytes → ArrayBuffer → challenge flow.
 */
function hexToBase64Url(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = clean.length % 2 === 0 ? clean : '0' + clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let idx = 0; idx < bytes.length; idx++) {
    bytes[idx] = parseInt(padded.slice(idx * 2, idx * 2 + 2), 16);
  }
  return Buffer.from(bytes).toString('base64url');
}
