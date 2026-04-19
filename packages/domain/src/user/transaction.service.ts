import {AccountId} from '../account';
import type {TransactionRepository} from '../ports';
import {TransactionHash} from './types';
import type {DeleteDescriptionInput, DeleteTransactionDescriptionUseCase} from './use-case/delete-transaction-description.use-case';
import type {FetchTransactionsInput, FetchTransactionsOutput, FetchTransactionsUseCase} from './use-case/fetch-transactions.use-case';
import type {SetDescriptionInput, SetTransactionDescriptionUseCase} from './use-case/set-transaction-description.use-case';

// =============================================================================
// Dependencies
// =============================================================================

export interface TransactionServiceDeps {
  transactionRepository: TransactionRepository;
}

// Re-export UseCase types for backward compatibility
export type {FetchTransactionsInput, FetchTransactionsOutput} from './use-case/fetch-transactions.use-case';
export type {SetDescriptionInput} from './use-case/set-transaction-description.use-case';
export type {DeleteDescriptionInput} from './use-case/delete-transaction-description.use-case';

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for transaction retrieval.
 */
export class TransactionService implements FetchTransactionsUseCase, SetTransactionDescriptionUseCase, DeleteTransactionDescriptionUseCase {
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
