// =============================================================================
// WebAuthn Types
// =============================================================================

export interface WebAuthnRegistrationOptions {
  challenge: string;
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  timeoutMs: number;
}

export interface WebAuthnAuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials?: Array<{
    id: string;
    type: 'public-key';
  }>;
  timeoutMs: number;
  /**
   * WebAuthn user verification requirement (biometric/PIN prompt).
   * - 'required': authenticator MUST verify the user (e.g. fingerprint)
   * - 'preferred': verify if possible, skip if not supported
   * - 'discouraged': skip verification (faster, less secure)
   */
  userVerification: 'required' | 'preferred' | 'discouraged';
}

export interface WebAuthnRegistrationResponse {
  credentialId: string;
  publicKey: string;
  credentialPublicKey: string;
  signCount: number;
}

export interface WebAuthnAuthenticationResponse {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  signCount: number;
}
