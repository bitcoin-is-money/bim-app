import {DomainError} from '../shared';
import type {AccountId, AccountStatus} from './types';

export class InvalidAccountIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid account ID format: ${value}`);
  }
}

export class InvalidUsernameError extends DomainError {
  constructor(readonly value: string) {
    super(
      `Invalid username: "${value}". Must be 3-25 characters, alphanumeric and underscores only.`,
    );
  }
}

export class InvalidStarknetAddressError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid Starknet address format: ${value}`);
  }
}

export class AccountNotFoundError extends DomainError {
  constructor(readonly accountId: AccountId | string) {
    super(`Account not found: ${accountId}`);
  }
}

export class AccountAlreadyExistsError extends DomainError {
  constructor(readonly username: string) {
    super(`Account with username '${username}' already exists`);
  }
}

export class AccountDeploymentError extends DomainError {
  constructor(
    readonly accountId: AccountId,
    readonly reason: string,
  ) {
    super(`Failed to deploy account ${accountId}: ${reason}`);
  }
}

export class InvalidAccountStateError extends DomainError {
  constructor(
    readonly currentStatus: AccountStatus,
    readonly attemptedAction: string,
    readonly errorDetails?: string
  ) {
    const details = errorDetails ? `(${errorDetails})` : '';
    super(`Cannot ${attemptedAction} with account in '${currentStatus}' status ${details}`);
  }
}
