import type {Account, AccountId, CredentialId, StarknetAddress} from '../account';

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
   * Finds an account by its Starknet address.
   */
  findByStarknetAddress(address: StarknetAddress): Promise<Account | undefined>;

  /**
   * Checks if a username already exists.
   */
  existsByUsername(username: string): Promise<boolean>;

  /**
   * Atomically transitions the account from 'pending' to 'deploying'.
   * Sets the starknet address and deployment tx hash.
   * Returns true if the transition succeeded (status was 'pending'), false if lost to a concurrent call.
   */
  markAsDeploying(
    accountId: AccountId,
    starknetAddress: StarknetAddress,
    txHash: string,
  ): Promise<boolean>;

  /**
   * Deletes an account by ID.
   */
  delete(id: AccountId): Promise<void>;
}
