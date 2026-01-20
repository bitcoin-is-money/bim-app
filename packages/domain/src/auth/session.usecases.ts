import {Account} from '../account/account';
import type {AccountRepository} from '../ports/account.repository';
import type {SessionRepository} from '../ports/session.repository';
import {Session} from './session';
import {SessionId, SessionNotFoundError} from './types';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface SessionUseCasesDeps {
  sessionRepository: SessionRepository;
  accountRepository: AccountRepository;
}

// =============================================================================
// Validate Session
// =============================================================================

export interface ValidateSessionInput {
  sessionId: string;
}

export interface ValidateSessionOutput {
  session: Session;
  account: Account;
}

/**
 * Validates an active session and returns the associated account.
 * Use this for protected routes to verify user authentication.
 */
export function validateSession(
  deps: SessionUseCasesDeps,
) {
  return async (input: ValidateSessionInput): Promise<ValidateSessionOutput> => {
    const sessionId = SessionId.of(input.sessionId);
    const session = await deps.sessionRepository.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Throws SessionExpiredError if expired
    session.validate();

    const account = await deps.accountRepository.findById(session.accountId);
    if (!account) {
      // Orphaned session - clean up
      await deps.sessionRepository.delete(sessionId);
      throw new SessionNotFoundError(sessionId);
    }

    return { session, account };
  };
}

// =============================================================================
// Logout
// =============================================================================

export interface LogoutInput {
  sessionId: string;
}

/**
 * Invalidates a session (logout).
 */
export function logout(
  deps: Pick<SessionUseCasesDeps, 'sessionRepository'>,
) {
  return async (input: LogoutInput): Promise<void> => {
    const sessionId = SessionId.of(input.sessionId);
    await deps.sessionRepository.delete(sessionId);
  };
}
