import type {Transaction} from '../transaction';

export interface FetchTransactionsInput {
  accountId: string;
  limit?: number;
  offset?: number;
}

export interface FetchTransactionsOutput {
  transactions: Transaction[];
  total: number;
}

/**
 * Fetches paginated transactions for an account.
 */
export interface FetchTransactionsUseCase {
  fetchForAccount(input: FetchTransactionsInput): Promise<FetchTransactionsOutput>;
}
