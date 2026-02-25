// =============================================================================
// WebAuthn Types
// =============================================================================

export interface WebAuthnRegistrationOptions {
  challenge: string;
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  timeout?: number;
}

export interface WebAuthnAuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials?: Array<{
    id: string;
    type: 'public-key';
  }>;
  timeout?: number;
  userVerification?: 'required' | 'preferred' | 'discouraged';
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
