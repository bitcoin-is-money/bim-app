import type {Account} from '../../account';
import type {Session} from '../session';

export interface CompleteRegistrationInput {
  challengeId: string;
  accountId: string;
  username: string;
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

export interface CompleteRegistrationOutput {
  account: Account;
  session: Session;
}

/**
 * Completes WebAuthn registration after user interaction.
 */
export interface CompleteRegistrationUseCase {
  complete(input: CompleteRegistrationInput): Promise<CompleteRegistrationOutput>;
}
