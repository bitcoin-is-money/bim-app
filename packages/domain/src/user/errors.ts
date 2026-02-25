import {DomainError} from '../shared';
import type {AccountId} from '../account';
import type {TransactionId} from './types';

export class UserSettingsNotFoundError extends DomainError {
  constructor(readonly accountId: AccountId) {
    super(`User settings not found for account: ${accountId}`);
  }
}

export class TransactionNotFoundError extends DomainError {
  constructor(readonly transactionId: TransactionId) {
    super(`Transaction not found: ${transactionId}`);
  }
}
