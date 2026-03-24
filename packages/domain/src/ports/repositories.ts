import type {Account, AccountId, CredentialId} from '../account';
import type {Challenge, ChallengeId, Session, SessionId} from '../auth';
import type {StarknetAddress} from '../shared';
import type {Swap, SwapDirection, SwapId, SwapStatus} from '../swap';
import type {Transaction, TransactionHash, TransactionId, UserSettings} from '../user';

/**
 * Repository interface for Account persistence.
 */
export interface AccountRepository {
  /** Saves an account (create or update). */
  save(account: Account): Promise<void>;

  /** Finds an account by its ID. */
  findById(id: AccountId): Promise<Account | undefined>;

  /** Finds an account by username. */
  findByUsername(username: string): Promise<Account | undefined>;

  /** Finds an account by credential ID. */
  findByCredentialId(credentialId: CredentialId): Promise<Account | undefined>;

  /** Finds an account by its Starknet address. */
  findByStarknetAddress(address: StarknetAddress): Promise<Account | undefined>;

  /** Checks if a username already exists. */
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

  /** Deletes an account by ID. */
  delete(id: AccountId): Promise<void>;
}

/**
 * Repository interface for WebAuthn Challenge persistence.
 */
export interface ChallengeRepository {
  /** Saves a challenge. */
  save(challenge: Challenge): Promise<void>;

  /** Finds a challenge by its ID. */
  findById(id: ChallengeId): Promise<Challenge | undefined>;

  /**
   * Atomically marks a challenge as used and returns it.
   * Returns undefined if the challenge does not exist, is already used, or has expired.
   * This prevents TOCTOU race conditions on challenge consumption.
   */
  consumeById(id: ChallengeId): Promise<Challenge | undefined>;

  /** Finds a challenge by its challenge string. */
  findByChallenge(challenge: string): Promise<Challenge | undefined>;

  /** Deletes a challenge by ID. */
  delete(id: ChallengeId): Promise<void>;
}

/**
 * Repository interface for Session persistence.
 */
export interface SessionRepository {
  /** Saves a session. */
  save(session: Session): Promise<void>;

  /** Finds a session by its ID. */
  findById(id: SessionId): Promise<Session | undefined>;

  /** Finds all sessions for an account. */
  findByAccountId(accountId: AccountId): Promise<Session[]>;

  /** Deletes a session by ID. */
  delete(id: SessionId): Promise<void>;

  /** Deletes all sessions for an account. */
  deleteByAccountId(accountId: AccountId): Promise<void>;
}

/**
 * Repository interface for Swap persistence.
 * Swaps can be stored in-memory for ephemeral data or in a database for persistence.
 */
export interface SwapRepository {
  /** Saves a swap. */
  save(swap: Swap): Promise<void>;

  /** Finds a swap by its ID. */
  findById(id: SwapId): Promise<Swap | undefined>;

  /** Finds all swaps with a given status. */
  findByStatus(status: SwapStatus): Promise<Swap[]>;

  /** Finds all swaps for a destination address. */
  findByDestinationAddress(address: string): Promise<Swap[]>;

  /** Finds all active (non-terminal) swaps. */
  findActive(): Promise<Swap[]>;

  /** Finds swaps by direction. */
  findByDirection(direction: SwapDirection): Promise<Swap[]>;

  /** Deletes a swap by ID. */
  delete(id: SwapId): Promise<void>;

  /** Deletes all expired swaps older than a given date. */
  deleteExpiredBefore(date: Date): Promise<number>;
}

/**
 * Pagination options for transaction queries.
 */
export interface TransactionPaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Repository interface for Transaction persistence.
 */
export interface TransactionRepository {
  /** Saves a transaction (insert or update). */
  save(transaction: Transaction): Promise<void>;

  /** Saves multiple transactions in a batch. */
  saveMany(transactions: Transaction[]): Promise<void>;

  /** Finds a transaction by ID. */
  findById(id: TransactionId): Promise<Transaction | undefined>;

  /** Finds a transaction by its hash. */
  findByHash(hash: TransactionHash): Promise<Transaction | undefined>;

  /** Finds all transactions for an account with pagination. */
  findByAccountId(
    accountId: AccountId,
    options: TransactionPaginationOptions,
  ): Promise<Transaction[]>;

  /** Counts transactions for an account. */
  countByAccountId(accountId: AccountId): Promise<number>;

  /** Checks if a transaction with the given hash exists. */
  existsByHash(hash: TransactionHash): Promise<boolean>;

  /** Saves a description for a transaction (upsert: insert or update if exists). */
  saveDescription(transactionHash: TransactionHash, accountId: AccountId, description: string): Promise<void>;

  /** Deletes the description for a transaction. */
  deleteDescription(transactionHash: TransactionHash, accountId: AccountId): Promise<void>;
}

/**
 * Repository interface for UserSettings persistence.
 */
export interface UserSettingsRepository {
  /** Saves user settings (insert or update). */
  save(settings: UserSettings): Promise<void>;

  /** Finds user settings by account ID. */
  findByAccountId(accountId: AccountId): Promise<UserSettings | undefined>;
}
