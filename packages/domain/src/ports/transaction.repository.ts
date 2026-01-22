import {Transaction, TransactionHash, TransactionId, WatchedAddressId} from '@bim/domain/user';

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
   * Finds all transactions for a watched address with pagination.
   */
  findByWatchedAddressId(
    watchedAddressId: WatchedAddressId,
    options: TransactionPaginationOptions,
  ): Promise<Transaction[]>;

  /**
   * Counts transactions for a watched address.
   */
  countByWatchedAddressId(watchedAddressId: WatchedAddressId): Promise<number>;

  /**
   * Checks if a transaction with the given hash exists.
   */
  existsByHash(hash: TransactionHash): Promise<boolean>;
}
