import {DomainError, ErrorCode} from '../shared';
import type {AccountId, AccountStatus} from './types';

export class InvalidAccountIdError extends DomainError {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(readonly value: string) {
    super(`Invalid account ID format: ${value}`);
  }
}

export class InvalidUsernameError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_USERNAME;

  constructor(readonly value: string) {
    super(
      `Invalid username: "${value}". Must be 3-25 characters, alphanumeric and underscores only.`,
    );
  }

  override get args(): Record<string, string> {
    return {username: this.value};
  }
}

export class InvalidStarknetAddressError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_STARKNET_ADDRESS;

  constructor(readonly value: string) {
    super(`Invalid Starknet address format: ${value}`);
  }
}

export class AccountNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.ACCOUNT_NOT_FOUND;

  constructor(readonly accountId: AccountId | string) {
    super(`Account not found: ${accountId}`);
  }
}

export class AccountAlreadyExistsError extends DomainError {
  readonly errorCode = ErrorCode.ACCOUNT_ALREADY_EXISTS;

  constructor(readonly username: string) {
    super(`Account with username '${username}' already exists`);
  }

  override get args(): Record<string, string> {
    return {username: this.username};
  }
}

export class AccountDeploymentError extends DomainError {
  readonly errorCode = ErrorCode.ACCOUNT_DEPLOYMENT_FAILED;

  constructor(
    readonly accountId: AccountId,
    readonly reason: string,
  ) {
    super(`Failed to deploy account ${accountId}: ${reason}`);
  }
}

export class InvalidAccountStateError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_ACCOUNT_STATE;

  constructor(
    readonly currentStatus: AccountStatus,
    readonly attemptedAction: string,
    readonly errorDetails?: string
  ) {
    const details = errorDetails ? `(${errorDetails})` : '';
    super(`Cannot ${attemptedAction} with account in '${currentStatus}' status ${details}`);
  }

  override get args(): Record<string, string> {
    return {status: this.currentStatus, action: this.attemptedAction};
  }
}
