import type {Logger} from 'pino';
import type {AccountRepository, SessionRepository} from '../../ports';
import {SessionNotFoundError} from '../errors';
import {SessionId} from '../session';
import type {SessionConfig} from '../session.config';
import type {
  ValidateSessionInput,
  ValidateSessionOutput,
  ValidateSessionUseCase,
} from '../use-cases/validate-session.use-case';

export interface ValidateSessionDeps {
  sessionRepository: SessionRepository;
  accountRepository: AccountRepository;
  sessionConfig: SessionConfig;
  logger: Logger;
}

/**
 * Validates an active session and returns the associated account.
 * Use this for protected routes to verify user authentication.
 *
 * Renews the session (sliding window) on each successful validation.
 *
 * @throws SessionNotFoundError if session doesn't exist (or has orphaned account)
 * @throws SessionExpiredError if session is expired
 * @throws InvalidSessionIdError if the session ID format is invalid
 */
export class ValidateSession implements ValidateSessionUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: ValidateSessionDeps) {
    this.log = deps.logger.child({name: 'validate-session.service.ts'});
  }

  async execute(input: ValidateSessionInput): Promise<ValidateSessionOutput> {
    const sessionId = SessionId.of(input.sessionId);
    const session = await this.deps.sessionRepository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Throws SessionExpiredError if expired
    session.validate();

    const account = await this.deps.accountRepository.findById(session.accountId);
    if (!account) {
      // Orphaned session — clean up and report as not found
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
}
