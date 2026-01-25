import {AccountId, StarknetAddress} from '../account';
import {DomainError} from '../shared';

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
 * Unique identifier for a WatchedAddress.
 */
export type WatchedAddressId = string & {readonly __brand: 'WatchedAddressId'};

export namespace WatchedAddressId {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  export function of(value: string): WatchedAddressId {
    if (!UUID_REGEX.test(value)) {
      throw new InvalidWatchedAddressIdError(value);
    }
    return value as WatchedAddressId;
  }

  export function generate(): WatchedAddressId {
    return crypto.randomUUID() as WatchedAddressId;
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

/**
 * Fiat currency code (ISO 4217).
 */
export type FiatCurrency = string & {readonly __brand: 'FiatCurrency'};

export namespace FiatCurrency {
  const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const;
  export type Supported = (typeof SUPPORTED_CURRENCIES)[number];

  export const DEFAULT: FiatCurrency = 'USD' as FiatCurrency;

  export function of(value: string): FiatCurrency {
    const normalized = value.trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(normalized as Supported)) {
      throw new UnsupportedCurrencyError(value);
    }
    return normalized as FiatCurrency;
  }

  export function isSupported(value: string): boolean {
    return SUPPORTED_CURRENCIES.includes(value.trim().toUpperCase() as Supported);
  }

  export function getSupportedCurrencies(): readonly string[] {
    return SUPPORTED_CURRENCIES;
  }
}

// =============================================================================
// Enums & Types
// =============================================================================

export type AddressType = 'main' | 'imported';

export type TransactionType = 'receipt' | 'spent';

// =============================================================================
// Data Interfaces
// =============================================================================

export interface UserSettingsData {
  id: UserSettingsId;
  accountId: AccountId;
  fiatCurrency: FiatCurrency;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchedAddressData {
  id: WatchedAddressId;
  accountId: AccountId;
  starknetAddress: StarknetAddress;
  addressType: AddressType;
  isActive: boolean;
  registeredAt: Date;
  lastScannedBlock?: bigint;
}

export interface TransactionData {
  id: TransactionId;
  watchedAddressId: WatchedAddressId;
  transactionHash: TransactionHash;
  blockNumber: bigint;
  transactionType: TransactionType;
  amount: string; // String to preserve precision
  tokenAddress: StarknetAddress;
  fromAddress: StarknetAddress;
  toAddress: StarknetAddress;
  timestamp: Date;
  indexedAt: Date;
}

// =============================================================================
// Errors
// =============================================================================

export class InvalidUserSettingsIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid user settings ID format: ${value}`);
  }
}

export class InvalidWatchedAddressIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid watched address ID format: ${value}`);
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

export class UnsupportedCurrencyError extends DomainError {
  constructor(readonly currency: string) {
    super(`Unsupported currency: ${currency}. Supported: ${FiatCurrency.getSupportedCurrencies().join(', ')}`);
  }
}

export class UserSettingsNotFoundError extends DomainError {
  constructor(readonly accountId: AccountId) {
    super(`User settings not found for account: ${accountId}`);
  }
}

export class WatchedAddressNotFoundError extends DomainError {
  constructor(readonly identifier: WatchedAddressId | string) {
    super(`Watched address not found: ${identifier}`);
  }
}

export class WatchedAddressAlreadyExistsError extends DomainError {
  constructor(readonly starknetAddress: StarknetAddress) {
    super(`Watched address already registered: ${starknetAddress}`);
  }
}

export class TransactionNotFoundError extends DomainError {
  constructor(readonly transactionId: TransactionId) {
    super(`Transaction not found: ${transactionId}`);
  }
}
