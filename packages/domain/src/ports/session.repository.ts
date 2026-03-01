import type {AccountId} from '../account';
import type {Session, SessionId} from '../auth';

/**
 * Repository interface for Session persistence.
 */
export interface SessionRepository {
  /**
   * Saves a session.
   */
  save(session: Session): Promise<void>;

  /**
   * Finds a session by its ID.
   */
  findById(id: SessionId): Promise<Session | undefined>;

  /**
   * Finds all sessions for an account.
   */
  findByAccountId(accountId: AccountId): Promise<Session[]>;

  /**
   * Deletes a session by ID.
   */
  delete(id: SessionId): Promise<void>;

  /**
   * Deletes all sessions for an account.
   */
  deleteByAccountId(accountId: AccountId): Promise<void>;

  /**
   * Deletes all expired sessions.
   */
  deleteExpired(): Promise<number>;
}
