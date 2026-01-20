import { DomainError } from '../shared/errors';
/**
 * Username for an Account.
 *
 * Format: 3-20 characters, alphanumeric and underscores only.
 * Example: "john_doe", "alice123"
 */
export type Username = string & {
    readonly __brand: 'Username';
};
export declare namespace Username {
    /** Validation pattern: 3-20 chars, alphanumeric + underscore */
    const PATTERN: RegExp;
    /**
     * Creates a Username from a string.
     *
     * @param value - Raw username string
     * @throws InvalidUsernameError if format is invalid
     */
    function of(value: string): Username;
    /**
     * Checks if a string is a valid username without throwing.
     */
    function isValid(value: string): boolean;
}
/**
 * Unique identifier for an Account in our database.
 *
 * Format: UUID v4
 * Example: "550e8400-e29b-41d4-a716-446655440000"
 *
 * Note: This is NOT the Starknet address. It's our internal ID for the account record.
 */
export type AccountId = string & {
    readonly __brand: 'AccountId';
};
export declare namespace AccountId {
    /**
     * Creates an AccountId from an existing UUID string.
     *
     * @param uuid - UUID v4 string
     * @throws InvalidAccountIdError if not a valid UUID
     */
    function of(uuid: string): AccountId;
    /**
     * Generates a new random AccountId.
     */
    function generate(): AccountId;
}
/**
 * Starknet contract address.
 *
 * Format: 0x-prefixed hexadecimal string, normalized to 66 characters (0x + 64 hex).
 * Example: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
 */
export type StarknetAddress = string & {
    readonly __brand: 'StarknetAddress';
};
export declare namespace StarknetAddress {
    /**
     * Creates a StarknetAddress from a hex string.
     *
     * @param hexAddress - Hex string with 0x prefix (e.g., "0x049d36...")
     * @returns Normalized StarknetAddress (lowercase, zero-padded to 66 chars)
     * @throws InvalidStarknetAddressError if the format is invalid
     */
    function of(hexAddress: string): StarknetAddress;
    function isValid(hexAddress: string): boolean;
}
/**
 * WebAuthn credential identifier.
 *
 * This is the unique ID assigned by the authenticator (e.g., YubiKey, TouchID)
 * during WebAuthn registration. It's used to identify which credential to use
 * during authentication.
 *
 * Format: Base64URL-encoded string, as returned by the WebAuthn API.
 * Example: "dGVzdC1jcmVkZW50aWFsLWlk"
 */
export type CredentialId = string & {
    readonly __brand: 'CredentialId';
};
export declare namespace CredentialId {
    /**
     * Creates a CredentialId from a base64url-encoded string.
     *
     * @param base64UrlId - Base64URL-encoded credential ID from WebAuthn API
     * @throws ValidationError if empty
     */
    function of(base64UrlId: string): CredentialId;
}
export type AccountStatus = 'pending' | 'deploying' | 'deployed' | 'failed';
export declare class InvalidUsernameError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class InvalidAccountIdError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class InvalidStarknetAddressError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class AccountNotFoundError extends DomainError {
    readonly accountId: AccountId | string;
    constructor(accountId: AccountId | string);
}
export declare class AccountAlreadyExistsError extends DomainError {
    readonly username: string;
    constructor(username: string);
}
export declare class AccountDeploymentError extends DomainError {
    readonly accountId: AccountId;
    readonly reason: string;
    constructor(accountId: AccountId, reason: string);
}
export declare class InvalidAccountStateError extends DomainError {
    readonly currentStatus: AccountStatus;
    readonly attemptedAction: string;
    readonly errorDetails?: string | undefined;
    constructor(currentStatus: AccountStatus, attemptedAction: string, errorDetails?: string | undefined);
}
export interface CreateAccountParams {
    id: AccountId;
    username: string;
    credentialId: CredentialId;
    publicKey: string;
    credentialPublicKey?: string;
}
export interface AccountData {
    id: AccountId;
    username: string;
    credentialId: CredentialId;
    publicKey: string;
    credentialPublicKey?: string;
    starknetAddress?: StarknetAddress;
    status: AccountStatus;
    deploymentTxHash?: string;
    signCount: number;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=types.d.ts.map