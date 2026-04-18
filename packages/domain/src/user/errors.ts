import type {AccountId} from '../account';
import {DomainError, ErrorCode} from '../shared';
import type {TransactionId} from './types';

export class InvalidUserSettingsIdError extends DomainError {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(readonly value: string) {
    super(`Invalid user settings ID format: ${value}`);
  }
}

export class InvalidTransactionIdError extends DomainError {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(readonly value: string) {
    super(`Invalid transaction ID format: ${value}`);
  }
}

export class InvalidTransactionHashError extends DomainError {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(readonly value: string) {
    super(`Invalid transaction hash format: ${value}`);
  }
}

export class UnsupportedLanguageError extends DomainError {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(readonly language: string, supportedLanguages: readonly string[]) {
    super(`Unsupported language: ${language}. Supported: ${supportedLanguages.join(', ')}`);
  }
}

export class UserSettingsNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.USER_SETTINGS_NOT_FOUND;

  constructor(readonly accountId: AccountId) {
    super(`User settings not found for account: ${accountId}`);
  }
}

export class TransactionNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.INTERNAL_ERROR;

  constructor(readonly transactionId: TransactionId) {
    super(`Transaction not found: ${transactionId}`);
  }
}
