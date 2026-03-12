import {ValidationError} from '../shared';
import {InvalidSessionIdError} from './errors';

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

// =============================================================================
// Constants
// =============================================================================

export const SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const CHALLENGE_DURATION_MS = 60 * 1000; // 60 seconds
