import type {WebAuthnAuthenticationOptions} from '../webauthn.types';

export interface BeginAuthenticationOutput {
  options: WebAuthnAuthenticationOptions;
  challengeId: string;
}

/**
 * Initiates WebAuthn authentication using discoverable credentials.
 */
export interface BeginLoginUseCase {
  beginAuthentication(): Promise<BeginAuthenticationOutput>;
}
