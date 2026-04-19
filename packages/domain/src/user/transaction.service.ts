import {AccountId} from '../account';
import type {TransactionRepository} from '../ports';
import type {FetchTransactionsInput, FetchTransactionsOutput, FetchTransactionsUseCase} from './use-case/fetch-transactions.use-case';

// =============================================================================
// Dependencies
// =============================================================================

export interface TransactionServiceDeps {
  transactionRepository: TransactionRepository;
}

// Re-export UseCase types for backward compatibility
export type {FetchTransactionsInput, FetchTransactionsOutput} from './use-case/fetch-transactions.use-case';

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for transaction retrieval.
 */
export class TransactionService implements FetchTransactionsUseCase {
  constructor(private readonly deps: TransactionServiceDeps) {}

  /**
   * Fetches transactions for an account.
   */
  async fetchForAccount(input: FetchTransactionsInput): Promise<FetchTransactionsOutput> {
    const accountId = AccountId.of(input.accountId);
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    const [transactions, total] = await Promise.all([
      this.deps.transactionRepository.findByAccountId(accountId, {limit, offset}),
      this.deps.transactionRepository.countByAccountId(accountId),
    ]);

    return {transactions, total};
  }
}
