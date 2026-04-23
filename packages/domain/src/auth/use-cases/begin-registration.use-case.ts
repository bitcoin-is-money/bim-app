import type {AccountId} from '../../account';
import type {WebAuthnRegistrationOptions} from '../webauthn.types';

export interface BeginRegistrationInput {
  username: string;
}

export interface BeginRegistrationOutput {
  options: WebAuthnRegistrationOptions;
  challengeId: string;
  accountId: AccountId;
}

/**
 * Initiates WebAuthn registration by creating a challenge.
 */
export interface BeginRegistrationUseCase {
  execute(input: BeginRegistrationInput): Promise<BeginRegistrationOutput>;
}
