import type {Challenge, ChallengeId} from '../auth';

/**
 * Repository interface for WebAuthn Challenge persistence.
 */
export interface ChallengeRepository {
  /**
   * Saves a challenge.
   */
  save(challenge: Challenge): Promise<void>;

  /**
   * Finds a challenge by its ID.
   */
  findById(id: ChallengeId): Promise<Challenge | undefined>;

  /**
   * Atomically marks a challenge as used and returns it.
   * Returns undefined if the challenge does not exist, is already used, or has expired.
   * This prevents TOCTOU race conditions on challenge consumption.
   */
  consumeById(id: ChallengeId): Promise<Challenge | undefined>;

  /**
   * Finds a challenge by its challenge string.
   */
  findByChallenge(challenge: string): Promise<Challenge | undefined>;

  /**
   * Deletes a challenge by ID.
   */
  delete(id: ChallengeId): Promise<void>;

  /**
   * Deletes all expired challenges.
   */
  deleteExpired(): Promise<number>;
}
