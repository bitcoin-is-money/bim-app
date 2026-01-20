import { DomainError } from '../shared/errors';
import { AccountId, StarknetAddress } from '../account/types';
/**
 * Unique identifier for UserSettings.
 */
export type UserSettingsId = string & {
    readonly __brand: 'UserSettingsId';
};
export declare namespace UserSettingsId {
    function of(value: string): UserSettingsId;
    function generate(): UserSettingsId;
}
/**
 * Unique identifier for a UserAddress.
 */
export type UserAddressId = string & {
    readonly __brand: 'UserAddressId';
};
export declare namespace UserAddressId {
    function of(value: string): UserAddressId;
    function generate(): UserAddressId;
}
/**
 * Unique identifier for a Transaction.
 */
export type TransactionId = string & {
    readonly __brand: 'TransactionId';
};
export declare namespace TransactionId {
    function of(value: string): TransactionId;
    function generate(): TransactionId;
}
/**
 * Starknet transaction hash.
 */
export type TransactionHash = string & {
    readonly __brand: 'TransactionHash';
};
export declare namespace TransactionHash {
    function of(value: string): TransactionHash;
    function isValid(value: string): boolean;
}
/**
 * Fiat currency code (ISO 4217).
 */
export type FiatCurrency = string & {
    readonly __brand: 'FiatCurrency';
};
export declare namespace FiatCurrency {
    const SUPPORTED_CURRENCIES: readonly ["USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD"];
    export type Supported = (typeof SUPPORTED_CURRENCIES)[number];
    export const DEFAULT: FiatCurrency;
    export function of(value: string): FiatCurrency;
    export function isSupported(value: string): boolean;
    export function getSupportedCurrencies(): readonly string[];
    export {};
}
export type AddressType = 'main' | 'imported';
export type TransactionType = 'receipt' | 'spent';
export interface UserSettingsData {
    id: UserSettingsId;
    accountId: AccountId;
    fiatCurrency: FiatCurrency;
    createdAt: Date;
    updatedAt: Date;
}
export interface UserAddressData {
    id: UserAddressId;
    accountId: AccountId;
    starknetAddress: StarknetAddress;
    addressType: AddressType;
    isActive: boolean;
    registeredAt: Date;
    lastScannedBlock?: bigint;
}
export interface TransactionData {
    id: TransactionId;
    userAddressId: UserAddressId;
    transactionHash: TransactionHash;
    blockNumber: bigint;
    transactionType: TransactionType;
    amount: string;
    tokenAddress: StarknetAddress;
    fromAddress: StarknetAddress;
    toAddress: StarknetAddress;
    timestamp: Date;
    processedAt: Date;
}
export declare class InvalidUserSettingsIdError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class InvalidUserAddressIdError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class InvalidTransactionIdError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class InvalidTransactionHashError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class UnsupportedCurrencyError extends DomainError {
    readonly currency: string;
    constructor(currency: string);
}
export declare class UserSettingsNotFoundError extends DomainError {
    readonly accountId: AccountId;
    constructor(accountId: AccountId);
}
export declare class UserAddressNotFoundError extends DomainError {
    readonly identifier: UserAddressId | string;
    constructor(identifier: UserAddressId | string);
}
export declare class UserAddressAlreadyExistsError extends DomainError {
    readonly starknetAddress: StarknetAddress;
    constructor(starknetAddress: StarknetAddress);
}
export declare class TransactionNotFoundError extends DomainError {
    readonly transactionId: TransactionId;
    constructor(transactionId: TransactionId);
}
//# sourceMappingURL=types.d.ts.map