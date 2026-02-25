import type {AccountId} from "../account";
import {DomainError, ValidationError} from '../shared';

// =============================================================================
// Branded Types
// =============================================================================

/**
 * Unique identifier for a Session.
 */
export type SessionId = string & { readonly __brand: 'SessionId' };

export namespace SessionId {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  export function of(value: string): SessionId {
    if (!UUID_REGEX.test(value)) {
      throw new InvalidSessionIdError(value);
    }
    return value as SessionId;
  }

  export function generate(): SessionId {
    return crypto.randomUUID() as SessionId;
  }
}

export class InvalidSessionIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid session ID format: ${value}`);
  }
}

/**
 * Unique identifier for a WebAuthn Challenge.
 */
export type ChallengeId = string & { readonly __brand: 'ChallengeId' };

export namespace ChallengeId {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  export function of(value: string): ChallengeId {
    if (!UUID_REGEX.test(value)) {
      throw new ValidationError('challengeId', 'invalid UUID format');
    }
    return value as ChallengeId;
  }

  export function generate(): ChallengeId {
    return crypto.randomUUID() as ChallengeId;
  }
}

// =============================================================================
// Challenge Types
// =============================================================================

export type ChallengePurpose = 'registration' | 'authentication';

export interface ChallengeData {
  id: ChallengeId;
  challenge: string;
  purpose: ChallengePurpose;
  rpId?: string;
  origin?: string;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

// =============================================================================
// Session Types
// =============================================================================

export interface SessionData {
  id: SessionId;
  accountId: AccountId;
  expiresAt: Date;
  createdAt: Date;
}

// =============================================================================
// Constants
// =============================================================================

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CHALLENGE_DURATION_MS = 60 * 1000; // 60 seconds
