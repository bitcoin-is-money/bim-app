import {AccountId} from '../account';
import type {TransactionRepository} from '../ports';
import type {Transaction} from './transaction';
import {TransactionHash} from './types';

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

export interface SetDescriptionInput {
  accountId: string;
  transactionHash: string;
  description: string;
}

export interface DeleteDescriptionInput {
  accountId: string;
  transactionHash: string;
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

  /**
   * Sets a description on a transaction.
   */
  async setDescription(input: SetDescriptionInput): Promise<void> {
    const accountId = AccountId.of(input.accountId);
    const transactionHash = TransactionHash.of(input.transactionHash);
    await this.deps.transactionRepository.saveDescription(transactionHash, accountId, input.description);
  }

  /**
   * Deletes a description from a transaction.
   */
  async deleteDescription(input: DeleteDescriptionInput): Promise<void> {
    const accountId = AccountId.of(input.accountId);
    const transactionHash = TransactionHash.of(input.transactionHash);
    await this.deps.transactionRepository.deleteDescription(transactionHash, accountId);
  }
}
