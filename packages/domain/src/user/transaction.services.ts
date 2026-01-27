import {AccountId} from '../account';
import type {TransactionRepository, WatchedAddressRepository} from '../ports';
import {Transaction} from './transaction';
import {WatchedAddressId, WatchedAddressNotFoundError} from './types';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface TransactionServicesDeps {
  transactionRepository: TransactionRepository;
  watchedAddressRepository: WatchedAddressRepository;
}

// =============================================================================
// Fetch Transactions
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

export type FetchTransactionsService = (
  input: FetchTransactionsInput,
) => Promise<FetchTransactionsOutput>;

/**
 * Fetches transactions for all addresses of an account.
 */
export function getFetchTransactionsService(
  deps: TransactionServicesDeps,
): FetchTransactionsService {
  return async (input: FetchTransactionsInput): Promise<FetchTransactionsOutput> => {
    const accountId = AccountId.of(input.accountId);
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    // Get all watched addresses for this account
    const addresses = await deps.watchedAddressRepository.findByAccountId(accountId);

    if (addresses.length === 0) {
      return {transactions: [], total: 0};
    }

    // Fetch transactions for all addresses
    const transactionPromises = addresses.map((addr) =>
      deps.transactionRepository.findByWatchedAddressId(addr.id, {limit, offset}),
    );
    const countPromises = addresses.map((addr) =>
      deps.transactionRepository.countByWatchedAddressId(addr.id),
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
  };
}

// =============================================================================
// Fetch Transactions For Address
// =============================================================================

export interface FetchTransactionsForAddressInput {
  addressId: string;
  limit?: number;
  offset?: number;
}

export interface FetchTransactionsForAddressOutput {
  transactions: Transaction[];
  total: number;
}

export type FetchTransactionsForAddressService = (
  input: FetchTransactionsForAddressInput,
) => Promise<FetchTransactionsForAddressOutput>;

/**
 * Fetches transactions for a specific watched address.
 */
export function getFetchTransactionsForAddressService(
  deps: Pick<TransactionServicesDeps, 'transactionRepository' | 'watchedAddressRepository'>,
): FetchTransactionsForAddressService {
  return async (
    input: FetchTransactionsForAddressInput,
  ): Promise<FetchTransactionsForAddressOutput> => {
    const addressId = WatchedAddressId.of(input.addressId);
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    // Verify address exists
    const address = await deps.watchedAddressRepository.findById(addressId);
    if (!address) {
      throw new WatchedAddressNotFoundError(addressId);
    }

    const [transactions, total] = await Promise.all([
      deps.transactionRepository.findByWatchedAddressId(addressId, {limit, offset}),
      deps.transactionRepository.countByWatchedAddressId(addressId),
    ]);

    return {transactions, total};
  };
}
