import type {AccountId, StarknetAddress} from '../account';
import {DomainError} from '../shared';
import type {FiatCurrency} from './fiat-currency';
import type {Language} from './language';

// =============================================================================
// Branded Types
// =============================================================================

/**
 * Unique identifier for UserSettings.
 */
export type UserSettingsId = string & {readonly __brand: 'UserSettingsId'};

export namespace UserSettingsId {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  export function of(value: string): UserSettingsId {
    if (!UUID_REGEX.test(value)) {
      throw new InvalidUserSettingsIdError(value);
    }
    return value as UserSettingsId;
  }

  export function generate(): UserSettingsId {
    return crypto.randomUUID() as UserSettingsId;
  }
}

/**
 * Unique identifier for a Transaction.
 */
export type TransactionId = string & {readonly __brand: 'TransactionId'};

export namespace TransactionId {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  export function of(value: string): TransactionId {
    if (!UUID_REGEX.test(value)) {
      throw new InvalidTransactionIdError(value);
    }
    return value as TransactionId;
  }

  export function generate(): TransactionId {
    return crypto.randomUUID() as TransactionId;
  }
}

/**
 * Starknet transaction hash.
 */
export type TransactionHash = string & {readonly __brand: 'TransactionHash'};

export namespace TransactionHash {
  const HASH_REGEX = /^0x[a-fA-F0-9]{1,64}$/;

  export function of(value: string): TransactionHash {
    const trimmed = value.trim().toLowerCase();
    if (!HASH_REGEX.test(trimmed)) {
      throw new InvalidTransactionHashError(value);
    }
    // Normalize to full 66-character format
    const normalized = '0x' + trimmed.slice(2).padStart(64, '0');
    return normalized as TransactionHash;
  }

  export function isValid(value: string): boolean {
    return HASH_REGEX.test(value.trim());
  }
}

// =============================================================================
// Validation Errors (co-located with branded types to avoid circular deps)
// =============================================================================

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

// =============================================================================
// Enums & Types
// =============================================================================

export type TransactionType = 'receipt' | 'spent';

// =============================================================================
// Data Interfaces
// =============================================================================

export interface UserSettingsData {
  id: UserSettingsId;
  accountId: AccountId;
  fiatCurrency: FiatCurrency;
  language: Language;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionData {
  id: TransactionId;
  accountId: AccountId;
  transactionHash: TransactionHash;
  blockNumber: bigint;
  transactionType: TransactionType;
  amount: string; // String to preserve precision
  tokenAddress: StarknetAddress;
  fromAddress: StarknetAddress;
  toAddress: StarknetAddress;
  timestamp: Date;
  indexedAt: Date;
  description?: string;
}
