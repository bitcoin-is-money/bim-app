import {AccountId} from '../account';
import {SessionExpiredError} from './errors';
import {SESSION_DURATION_MS, type SessionData, SessionId} from './types';

/**
 * Session entity representing an authenticated user session.
 */
export class Session {
  private constructor(
    readonly id: SessionId,
    readonly accountId: AccountId,
    readonly expiresAt: Date,
    readonly createdAt: Date,
  ) {}

  /**
   * Creates a new session for the given account.
   */
  static create(accountId: AccountId): Session {
    const now = new Date();
    return new Session(
      SessionId.generate(),
      accountId,
      new Date(now.getTime() + SESSION_DURATION_MS),
      now,
    );
  }

  /**
   * Reconstitutes a session from persisted data.
   */
  static fromData(data: SessionData): Session {
    return new Session(
      data.id,
      data.accountId,
      data.expiresAt,
      data.createdAt,
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

  /**
   * Exports the session data for persistence.
   */
  toData(): SessionData {
    return {
      id: this.id,
      accountId: this.accountId,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
    };
  }
}
