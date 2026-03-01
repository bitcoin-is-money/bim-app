import {DomainError} from '../shared';
import type {AccountId} from '../account';
import type {TransactionId} from './types';

export class InvalidUserSettingsIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid user settings ID format: ${value}`);
  }
}

export class InvalidTransactionIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid transaction ID format: ${value}`);
  }
}

export class InvalidTransactionHashError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid transaction hash format: ${value}`);
  }
}

export class UnsupportedLanguageError extends DomainError {
  constructor(readonly language: string, supportedLanguages: readonly string[]) {
    super(`Unsupported language: ${language}. Supported: ${supportedLanguages.join(', ')}`);
  }
}

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
