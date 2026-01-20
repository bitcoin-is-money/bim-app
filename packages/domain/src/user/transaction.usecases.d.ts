import type { TransactionRepository } from '../ports/transaction.repository';
import type { UserAddressRepository } from '../ports/user-address.repository';
import { Transaction } from './transaction';
export interface TransactionUseCasesDeps {
    transactionRepository: TransactionRepository;
    userAddressRepository: UserAddressRepository;
}
export interface FetchTransactionsInput {
    accountId: string;
    limit?: number;
    offset?: number;
}
export interface FetchTransactionsOutput {
    transactions: Transaction[];
    total: number;
}
export type FetchTransactionsUseCase = (input: FetchTransactionsInput) => Promise<FetchTransactionsOutput>;
/**
 * Fetches transactions for all addresses of an account.
 */
export declare function getFetchTransactionsUseCase(deps: TransactionUseCasesDeps): FetchTransactionsUseCase;
export interface FetchTransactionsForAddressInput {
    addressId: string;
    limit?: number;
    offset?: number;
}
export interface FetchTransactionsForAddressOutput {
    transactions: Transaction[];
    total: number;
}
export type FetchTransactionsForAddressUseCase = (input: FetchTransactionsForAddressInput) => Promise<FetchTransactionsForAddressOutput>;
/**
 * Fetches transactions for a specific address.
 */
export declare function getFetchTransactionsForAddressUseCase(deps: Pick<TransactionUseCasesDeps, 'transactionRepository' | 'userAddressRepository'>): FetchTransactionsForAddressUseCase;
//# sourceMappingURL=transaction.usecases.d.ts.map