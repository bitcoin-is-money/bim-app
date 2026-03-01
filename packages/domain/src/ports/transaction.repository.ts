import type {AccountId} from '../account';
import type {Transaction, TransactionHash, TransactionId} from '../user';

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
  /**
   * Saves a transaction (insert or update).
   */
  save(transaction: Transaction): Promise<void>;

  /**
   * Saves multiple transactions in a batch.
   */
  saveMany(transactions: Transaction[]): Promise<void>;

  /**
   * Finds a transaction by ID.
   */
  findById(id: TransactionId): Promise<Transaction | undefined>;

  /**
   * Finds a transaction by its hash.
   */
  findByHash(hash: TransactionHash): Promise<Transaction | undefined>;

  /**
   * Finds all transactions for an account with pagination.
   */
  findByAccountId(
    accountId: AccountId,
    options: TransactionPaginationOptions,
  ): Promise<Transaction[]>;

  /**
   * Counts transactions for an account.
   */
  countByAccountId(accountId: AccountId): Promise<number>;

  /**
   * Checks if a transaction with the given hash exists.
   */
  existsByHash(hash: TransactionHash): Promise<boolean>;

  /**
   * Saves a description for a transaction (upsert: insert or update if exists).
   */
  saveDescription(transactionHash: TransactionHash, accountId: AccountId, description: string): Promise<void>;

  /**
   * Deletes the description for a transaction.
   */
  deleteDescription(transactionHash: TransactionHash, accountId: AccountId): Promise<void>;
}
