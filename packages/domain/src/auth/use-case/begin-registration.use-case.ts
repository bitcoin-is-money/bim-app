import type {WebAuthnRegistrationOptions} from '../webauthn.types';

export interface BeginRegistrationInput {
  username: string;
}

export interface BeginRegistrationOutput {
  options: WebAuthnRegistrationOptions;
  challengeId: string;
  accountId: string;
}

/**
 * Initiates WebAuthn registration by creating a challenge.
 */
export interface BeginRegistrationUseCase {
  beginRegistration(input: BeginRegistrationInput): Promise<BeginRegistrationOutput>;
}
