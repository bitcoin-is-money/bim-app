import type {Logger} from 'pino';
import type {Account} from '../account';
import type {AccountRepository, SessionRepository} from '../ports';
import {SessionNotFoundError} from './errors';
import {type Session, SessionId} from './session';
import type {SessionConfig} from './session.config';

// =============================================================================
// Dependencies
// =============================================================================

export interface SessionServiceDeps {
  sessionRepository: SessionRepository;
  accountRepository: AccountRepository;
  sessionConfig: SessionConfig;
  logger: Logger;
}

// =============================================================================
// Input/Output Types
// =============================================================================

export interface ValidateSessionInput {
  sessionId: string;
}

export interface ValidateSessionOutput {
  session: Session;
  account: Account;
}

export interface InvalidateSessionInput {
  sessionId: string;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for session management (validation and invalidation).
 */
export class SessionService {
  private readonly log: Logger;

  constructor(private readonly deps: SessionServiceDeps) {
    this.log = deps.logger.child({name: 'session.service.ts'});
  }

  /**
   * Validates an active session and returns the associated account.
   * Use this for protected routes to verify user authentication.
   *
   * @throws SessionNotFoundError if session doesn't exist
   * @throws SessionExpiredError if session is expired
   */
  async validate(input: ValidateSessionInput): Promise<ValidateSessionOutput> {
    const sessionId = SessionId.of(input.sessionId);
    const session = await this.deps.sessionRepository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Throws SessionExpiredError if expired
    session.validate();

    const account = await this.deps.accountRepository.findById(session.accountId);
    if (!account) {
      // Orphaned session - clean up
      this.log.warn({sessionId}, 'Orphaned session cleaned up');
      await this.deps.sessionRepository.delete(sessionId);
      throw new SessionNotFoundError(sessionId);
    }

    // Sliding session: extend expiry on each authenticated request
    const renewed = session.renew(this.deps.sessionConfig.durationMs);
    await this.deps.sessionRepository.save(renewed);

    this.log.debug({accountId: account.id}, 'Session validated and renewed');
    return {session: renewed, account};
  }

  /**
   * Invalidates a session (logout).
   * No-op if session doesn't exist.
   */
  async invalidate(input: InvalidateSessionInput): Promise<void> {
    const sessionId = SessionId.of(input.sessionId);
    await this.deps.sessionRepository.delete(sessionId);
  }
}
