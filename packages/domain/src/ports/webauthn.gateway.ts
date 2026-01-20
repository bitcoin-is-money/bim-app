/**
 * Gateway interface for WebAuthn verification operations.
 */
export interface WebAuthnGateway {
  /**
   * Verifies a WebAuthn registration response.
   */
  verifyRegistration(params: VerifyRegistrationParams): Promise<RegistrationVerificationResult>;

  /**
   * Verifies a WebAuthn authentication response.
   */
  verifyAuthentication(params: VerifyAuthenticationParams): Promise<AuthenticationVerificationResult>;
}

export interface VerifyRegistrationParams {
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
    };
    type: 'public-key';
  };
}

export interface RegistrationVerificationResult {
  verified: boolean;
  encodedCredentialId: Base64URLString;
  starknetPublicKeyX: string;
  encodedCredentialPublicKey: Base64URLString;
  signCount: number;
}

export interface VerifyAuthenticationParams {
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
    type: 'public-key';
  };
  storedCredential: {
    credentialId: Base64URLString;
    publicKey: string;
    credentialPublicKey?: string;
    signCount: number;
  };
}

export interface AuthenticationVerificationResult {
  verified: boolean;
  newSignCount: number;
}
