import type {SessionRepository} from '../../ports';
import {SessionId} from '../session';
import type {
  InvalidateSessionInput,
  InvalidateSessionUseCase,
} from '../use-cases/invalidate-session.use-case';

export interface InvalidateSessionDeps {
  sessionRepository: SessionRepository;
}

/**
 * Invalidates a session (logout). No-op if the session doesn't exist.
 *
 * @throws InvalidSessionIdError if the session ID format is invalid
 */
export class InvalidateSession implements InvalidateSessionUseCase {
  constructor(private readonly deps: InvalidateSessionDeps) {}

  async execute(input: InvalidateSessionInput): Promise<void> {
    const sessionId = SessionId.of(input.sessionId);
    await this.deps.sessionRepository.delete(sessionId);
  }
}
