import {DomainError, ErrorCode} from '../shared';
import type {ChallengeId} from './challenge';
import type {SessionId} from './session';

export class InvalidSessionIdError extends DomainError {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(readonly value: string) {
    super(`Invalid session ID format: ${value}`);
  }
}

export class SessionNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.SESSION_NOT_FOUND;

  constructor(readonly sessionId: SessionId | string) {
    super(`Session not found: ${sessionId}`);
  }
}

export class SessionExpiredError extends DomainError {
  readonly errorCode = ErrorCode.SESSION_EXPIRED;

  constructor(readonly sessionId: SessionId) {
    super(`Session expired: ${sessionId}`);
  }
}

export class ChallengeNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.CHALLENGE_NOT_FOUND;

  constructor(readonly challengeId: ChallengeId | string) {
    super(`Challenge not found: ${challengeId}`);
  }
}

export class ChallengeExpiredError extends DomainError {
  readonly errorCode = ErrorCode.CHALLENGE_EXPIRED;

  constructor(readonly challengeId: ChallengeId) {
    super(`Challenge expired: ${challengeId}`);
  }
}

export class ChallengeAlreadyUsedError extends DomainError {
  readonly errorCode = ErrorCode.CHALLENGE_ALREADY_USED;

  constructor(readonly challengeId: ChallengeId) {
    super(`Challenge already used: ${challengeId}`);
  }
}

export class InvalidChallengeError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_CHALLENGE;

  constructor(readonly challengeId: ChallengeId, readonly reason: string) {
    super(`Invalid challenge ${challengeId}: ${reason}`);
  }
}

export class AuthenticationFailedError extends DomainError {
  readonly errorCode = ErrorCode.AUTHENTICATION_FAILED;

  constructor(readonly reason: string) {
    super(`Authentication failed: ${reason}`);
  }
}

export class RegistrationFailedError extends DomainError {
  readonly errorCode = ErrorCode.REGISTRATION_FAILED;

  constructor(readonly reason: string) {
    super(`Registration failed: ${reason}`);
  }

  override get args(): Record<string, string> {
    return {reason: this.reason};
  }
}
