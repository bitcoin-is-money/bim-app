import type {WebAuthnAuthenticationOptions} from '../webauthn.types';

export interface BeginLoginOutput {
  options: WebAuthnAuthenticationOptions;
  challengeId: string;
}

/**
 * Initiates WebAuthn authentication using discoverable credentials (usernameless flow).
 */
export interface BeginLoginUseCase {
  execute(): Promise<BeginLoginOutput>;
}
