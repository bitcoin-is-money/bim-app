import type {SessionRepository} from '../../ports';
import {SessionId} from '../session';
import type {
  InvalidateSessionInput,
  InvalidateSessionUseCase,
} from '../use-cases/invalidate-session.use-case';

export interface SessionInvalidatorDeps {
  sessionRepository: SessionRepository;
}

/**
 * Invalidates a session (logout). No-op if the session doesn't exist.
 *
 * @throws InvalidSessionIdError if the session ID format is invalid
 */
export class SessionInvalidator implements InvalidateSessionUseCase {
  constructor(private readonly deps: SessionInvalidatorDeps) {}

  async invalidate(input: InvalidateSessionInput): Promise<void> {
    const sessionId = SessionId.of(input.sessionId);
    await this.deps.sessionRepository.delete(sessionId);
  }
}
