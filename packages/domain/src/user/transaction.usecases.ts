import {AccountId} from '@bim/domain/account';
import type {TransactionRepository, UserAddressRepository} from '@bim/domain/ports';
import {Transaction} from './transaction';
import {UserAddressId, UserAddressNotFoundError} from './types';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface TransactionUseCasesDeps {
  transactionRepository: TransactionRepository;
  userAddressRepository: UserAddressRepository;
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

export type FetchTransactionsUseCase = (
  input: FetchTransactionsInput,
) => Promise<FetchTransactionsOutput>;

/**
 * Fetches transactions for all addresses of an account.
 */
export function getFetchTransactionsUseCase(
  deps: TransactionUseCasesDeps,
): FetchTransactionsUseCase {
  return async (input: FetchTransactionsInput): Promise<FetchTransactionsOutput> => {
    const accountId = AccountId.of(input.accountId);
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    // Get all addresses for this account
    const addresses = await deps.userAddressRepository.findByAccountId(accountId);

    if (addresses.length === 0) {
      return {transactions: [], total: 0};
    }

    // Fetch transactions for all addresses
    const transactionPromises = addresses.map((addr) =>
      deps.transactionRepository.findByUserAddressId(addr.id, {limit, offset}),
    );
    const countPromises = addresses.map((addr) =>
      deps.transactionRepository.countByUserAddressId(addr.id),
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

export type FetchTransactionsForAddressUseCase = (
  input: FetchTransactionsForAddressInput,
) => Promise<FetchTransactionsForAddressOutput>;

/**
 * Fetches transactions for a specific address.
 */
export function getFetchTransactionsForAddressUseCase(
  deps: Pick<TransactionUseCasesDeps, 'transactionRepository' | 'userAddressRepository'>,
): FetchTransactionsForAddressUseCase {
  return async (
    input: FetchTransactionsForAddressInput,
  ): Promise<FetchTransactionsForAddressOutput> => {
    const addressId = UserAddressId.of(input.addressId);
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    // Verify address exists
    const address = await deps.userAddressRepository.findById(addressId);
    if (!address) {
      throw new UserAddressNotFoundError(addressId);
    }

    const [transactions, total] = await Promise.all([
      deps.transactionRepository.findByUserAddressId(addressId, {limit, offset}),
      deps.transactionRepository.countByUserAddressId(addressId),
    ]);

    return {transactions, total};
  };
}
