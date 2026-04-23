import type {Account} from '../../account';
import type {Session} from '../session';

export interface ValidateSessionInput {
  sessionId: string;
}

export interface ValidateSessionOutput {
  session: Session;
  account: Account;
}

/**
 * Validates an active session and returns the associated account.
 */
export interface ValidateSessionUseCase {
  execute(input: ValidateSessionInput): Promise<ValidateSessionOutput>;
}
