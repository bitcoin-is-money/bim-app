import type {ChallengeRepository} from '../../ports';
import type {Challenge, ChallengeId} from '../challenge';
import {ChallengeAlreadyUsedError, ChallengeNotFoundError} from '../errors';

export interface ChallengeConsumerDeps {
  challengeRepository: ChallengeRepository;
}

/**
 * Internal domain service — atomically consumes a WebAuthn challenge and
 * resolves precise errors when consumption fails.
 *
 * Encapsulates the "consume or explain why it failed" pattern shared by
 * Registrar.complete and Authenticator.complete.
 */
export class ChallengeConsumer {
  constructor(private readonly deps: ChallengeConsumerDeps) {}

  /**
   * Atomically consumes the challenge identified by `challengeId`.
   *
   * @returns the consumed Challenge on success.
   * @throws ChallengeNotFoundError if no challenge with that id exists.
   * @throws ChallengeExpiredError if the challenge exists but has expired.
   * @throws ChallengeAlreadyUsedError if a concurrent request consumed it first.
   */
  async consume(challengeId: ChallengeId): Promise<Challenge> {
    const challenge = await this.deps.challengeRepository.consumeById(challengeId);
    if (challenge) return challenge;

    // consumeById returned undefined — look up the challenge to throw
    // the most specific error (not found / expired / already used).
    const stale = await this.deps.challengeRepository.findById(challengeId);
    if (!stale) {
      throw new ChallengeNotFoundError(challengeId);
    }
    // validate() throws ChallengeExpiredError or ChallengeAlreadyUsedError
    stale.validate();
    // If validate() didn't throw, the challenge was consumed between our atomic
    // UPDATE and this SELECT — which means a concurrent request won the race.
    throw new ChallengeAlreadyUsedError(challengeId);
  }
}
