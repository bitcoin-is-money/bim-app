import type {Account, AccountId, CredentialId} from '../account';

/**
 * Repository interface for Account persistence.
 */
export interface AccountRepository {
  /**
   * Saves an account (create or update).
   */
  save(account: Account): Promise<void>;

  /**
   * Finds an account by its ID.
   */
  findById(id: AccountId): Promise<Account | undefined>;

  /**
   * Finds an account by username.
   */
  findByUsername(username: string): Promise<Account | undefined>;

  /**
   * Finds an account by credential ID.
   */
  findByCredentialId(credentialId: CredentialId): Promise<Account | undefined>;

  /**
   * Checks if a username already exists.
   */
  existsByUsername(username: string): Promise<boolean>;

  /**
   * Deletes an account by ID.
   */
  delete(id: AccountId): Promise<void>;
}
