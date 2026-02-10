import {AccountId} from '../account';
import type {TransactionRepository} from '../ports';
import {Transaction} from './transaction';

// =============================================================================
// Dependencies
// =============================================================================

export interface TransactionServiceDeps {
  transactionRepository: TransactionRepository;
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

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for transaction retrieval.
 */
export class TransactionService {
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
