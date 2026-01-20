import { AccountId } from '../account/types';
import { type SessionData, SessionId } from './types';
/**
 * Session entity representing an authenticated user session.
 */
export declare class Session {
    readonly id: SessionId;
    readonly accountId: AccountId;
    readonly expiresAt: Date;
    readonly createdAt: Date;
    private constructor();
    /**
     * Creates a new session for the given account.
     */
    static create(accountId: AccountId): Session;
    /**
     * Reconstitutes a session from persisted data.
     */
    static fromData(data: SessionData): Session;
    /**
     * Checks if the session has expired.
     */
    isExpired(): boolean;
    /**
     * Validates that the session is still active.
     * Throws SessionExpiredError if expired.
     */
    validate(): void;
    /**
     * Returns the remaining time until expiration in milliseconds.
     */
    getRemainingTimeMs(): number;
    /**
     * Exports the session data for persistence.
     */
    toData(): SessionData;
}
//# sourceMappingURL=session.d.ts.map