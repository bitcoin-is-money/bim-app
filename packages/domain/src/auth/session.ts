import type {AccountId} from '../account';
import {SessionExpiredError} from './errors';
import {SessionId} from './types';

/**
 * Session entity representing an authenticated user session.
 */
export class Session {
  constructor(
    readonly id: SessionId,
    readonly accountId: AccountId,
    readonly expiresAt: Date,
    readonly createdAt: Date,
  ) {}

  /**
   * Creates a new session for the given account.
   */
  static create(accountId: AccountId, durationMs: number): Session {
    const now = new Date();
    return new Session(
      SessionId.generate(),
      accountId,
      new Date(now.getTime() + durationMs),
      now,
    );
  }

  /**
   * Returns a renewed session with expiration extended from now.
   * Used for sliding session: each authenticated request resets the inactivity timer.
   */
  renew(durationMs: number): Session {
    return new Session(
      this.id,
      this.accountId,
      new Date(Date.now() + durationMs),
      this.createdAt,
    );
  }

  /**
   * Checks if the session has expired.
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Validates that the session is still active.
   * Throws SessionExpiredError if expired.
   */
  validate(): void {
    if (this.isExpired()) {
      throw new SessionExpiredError(this.id);
    }
  }

  /**
   * Returns the remaining time until expiration in milliseconds.
   */
  getRemainingTimeMs(): number {
    const remaining = this.expiresAt.getTime() - Date.now();
    return Math.max(0, remaining);
  }
}
