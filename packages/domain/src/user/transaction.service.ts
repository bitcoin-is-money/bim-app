import {AccountId} from '../account';
import type {TransactionRepository, WatchedAddressRepository} from '../ports';
import {Transaction} from './transaction';
import {WatchedAddressId, WatchedAddressNotFoundError} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface TransactionServiceDeps {
  transactionRepository: TransactionRepository;
  watchedAddressRepository: WatchedAddressRepository;
}

// =============================================================================
// Input/Output Types
// =============================================================================

export interface FetchTransactionsInput {
  accountId: string;
  limit?: number;
  offset?: number;
}

export interface FetchTransactionsOutput {
  transactions: Transaction[];
  total: number;
}

export interface FetchTransactionsForAddressInput {
  addressId: string;
  limit?: number;
  offset?: number;
}

export interface FetchTransactionsForAddressOutput {
  transactions: Transaction[];
  total: number;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for transaction retrieval.
 */
export class TransactionService {
  constructor(private readonly deps: TransactionServiceDeps) {}

  /**
   * Fetches transactions for all addresses of an account.
   */
  async fetchForAccount(input: FetchTransactionsInput): Promise<FetchTransactionsOutput> {
    const accountId = AccountId.of(input.accountId);
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    // Get all watched addresses for this account
    const addresses = await this.deps.watchedAddressRepository.findByAccountId(accountId);

    if (addresses.length === 0) {
      return {transactions: [], total: 0};
    }

    // Fetch transactions for all addresses
    const transactionPromises = addresses.map((addr) =>
      this.deps.transactionRepository.findByWatchedAddressId(addr.id, {limit, offset}),
    );
    const countPromises = addresses.map((addr) =>
      this.deps.transactionRepository.countByWatchedAddressId(addr.id),
    );

    const [transactionResults, countResults] = await Promise.all([
      Promise.all(transactionPromises),
      Promise.all(countPromises),
    ]);

    // Flatten and sort by timestamp (newest first)
    const allTransactions = transactionResults
      .flat()
      .sort((txA, txB) => txB.timestamp.getTime() - txA.timestamp.getTime())
      .slice(0, limit);

    const total = countResults.reduce((sum, count) => sum + count, 0);

    return {transactions: allTransactions, total};
  }

  /**
   * Fetches transactions for a specific watched address.
   *
   * @throws WatchedAddressNotFoundError if address doesn't exist
   */
  async fetchForAddress(
    input: FetchTransactionsForAddressInput,
  ): Promise<FetchTransactionsForAddressOutput> {
    const addressId = WatchedAddressId.of(input.addressId);
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    // Verify address exists
    const address = await this.deps.watchedAddressRepository.findById(addressId);
    if (!address) {
      throw new WatchedAddressNotFoundError(addressId);
    }

    const [transactions, total] = await Promise.all([
      this.deps.transactionRepository.findByWatchedAddressId(addressId, {limit, offset}),
      this.deps.transactionRepository.countByWatchedAddressId(addressId),
    ]);

    return {transactions, total};
  }
}
