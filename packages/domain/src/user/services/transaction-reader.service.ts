import {AccountId} from '../../account';
import type {TransactionRepository} from '../../ports';
import type {
  FetchTransactionsInput,
  FetchTransactionsOutput,
  FetchTransactionsUseCase,
} from '../use-cases/fetch-transactions.use-case';

export interface TransactionReaderDeps {
  transactionRepository: TransactionRepository;
}

/**
 * Fetches paginated transaction history for an account.
 */
export class TransactionReader implements FetchTransactionsUseCase {
  constructor(private readonly deps: TransactionReaderDeps) {}

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
