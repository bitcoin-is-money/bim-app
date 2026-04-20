import type {Account} from '../../account';
import type {Session} from '../session';

export interface CompleteAuthenticationInput {
  challengeId: string;
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
}

export interface CompleteAuthenticationOutput {
  account: Account;
  session: Session;
}

/**
 * Completes WebAuthn authentication after user interaction.
 */
export interface CompleteLoginUseCase {
  completeAuthentication(input: CompleteAuthenticationInput): Promise<CompleteAuthenticationOutput>;
}
