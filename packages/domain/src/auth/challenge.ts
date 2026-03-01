import {ChallengeAlreadyUsedError, ChallengeExpiredError} from './errors';
import {CHALLENGE_DURATION_MS, ChallengeId, type ChallengePurpose} from './types';

/**
 * Challenge entity representing a WebAuthn challenge for registration or authentication.
 * Challenges are single-use and short-lived.
 */
export class Challenge {
  private used: boolean;

  constructor(
    readonly id: ChallengeId,
    readonly challenge: string,
    readonly purpose: ChallengePurpose,
    readonly rpId: string | undefined,
    readonly origin: string | undefined,
    readonly expiresAt: Date,
    readonly createdAt: Date,
    used: boolean,
  ) {
    this.used = used;
  }

  /**
   * Creates a new challenge for registration.
   */
  static createForRegistration(params: {
    rpId: string;
    origin: string;
  }): Challenge {
    const now = new Date();
    const challenge = generateSecureChallenge();

    return new Challenge(
      ChallengeId.generate(),
      challenge,
      'registration',
      params.rpId,
      params.origin,
      new Date(now.getTime() + CHALLENGE_DURATION_MS),
      now,
      false,
    );
  }

  /**
   * Creates a new challenge for authentication (usernameless flow with discoverable credentials).
   */
  static createForAuthentication(params: {
    rpId: string;
    origin: string;
  }): Challenge {
    const now = new Date();
    const challenge = generateSecureChallenge();

    return new Challenge(
      ChallengeId.generate(),
      challenge,
      'authentication',
      params.rpId,
      params.origin,
      new Date(now.getTime() + CHALLENGE_DURATION_MS),
      now,
      false,
    );
  }

  /**
   * Checks if the challenge has expired.
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Checks if the challenge has been used.
   */
  isUsed(): boolean {
    return this.used;
  }

  /**
   * Validates and marks the challenge as used.
   * Throws if the challenge is expired or already used.
   */
  consume(): void {
    if (this.isExpired()) {
      throw new ChallengeExpiredError(this.id);
    }
    if (this.used) {
      throw new ChallengeAlreadyUsedError(this.id);
    }
    this.used = true;
  }

  /**
   * Validates the challenge without consuming it.
   */
  validate(): void {
    if (this.isExpired()) {
      throw new ChallengeExpiredError(this.id);
    }
    if (this.used) {
      throw new ChallengeAlreadyUsedError(this.id);
    }
  }

}

/**
 * Generates a cryptographically secure random challenge string.
 */
function generateSecureChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}
