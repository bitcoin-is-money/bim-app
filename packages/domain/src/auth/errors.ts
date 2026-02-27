import {DomainError} from '../shared';
import type {ChallengeId, SessionId} from './types';

export class InvalidSessionIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid session ID format: ${value}`);
  }
}

export class SessionNotFoundError extends DomainError {
  constructor(readonly sessionId: SessionId | string) {
    super(`Session not found: ${sessionId}`);
  }
}

export class SessionExpiredError extends DomainError {
  constructor(readonly sessionId: SessionId) {
    super(`Session expired: ${sessionId}`);
  }
}

export class ChallengeNotFoundError extends DomainError {
  constructor(readonly challengeId: ChallengeId | string) {
    super(`Challenge not found: ${challengeId}`);
  }
}

export class ChallengeExpiredError extends DomainError {
  constructor(readonly challengeId: ChallengeId) {
    super(`Challenge expired: ${challengeId}`);
  }
}

export class ChallengeAlreadyUsedError extends DomainError {
  constructor(readonly challengeId: ChallengeId) {
    super(`Challenge already used: ${challengeId}`);
  }
}

export class InvalidChallengeError extends DomainError {
  constructor(readonly challengeId: ChallengeId, readonly reason: string) {
    super(`Invalid challenge ${challengeId}: ${reason}`);
  }
}

export class AuthenticationFailedError extends DomainError {
  constructor(readonly reason: string) {
    super(`Authentication failed: ${reason}`);
  }
}

export class RegistrationFailedError extends DomainError {
  constructor(readonly reason: string) {
    super(`Registration failed: ${reason}`);
  }
}
