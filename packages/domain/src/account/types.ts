import {DomainError, ValidationError} from '@bim/domain/shared';

// =============================================================================
// Branded Types
// =============================================================================

/**
 * Username for an Account.
 *
 * Format: 3-20 characters, alphanumeric and underscores only.
 * Example: "john_doe", "alice123"
 */
export type Username = string & {readonly __brand: 'Username'};

export namespace Username {
  /** Validation pattern: 3-20 chars, alphanumeric + underscore */
  export const PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

  /**
   * Creates a Username from a string.
   *
   * @param value - Raw username string
   * @throws InvalidUsernameError if format is invalid
   */
  export function of(value: string): Username {
    const trimmed = value.trim();
    if (!PATTERN.test(trimmed)) {
      throw new InvalidUsernameError(value);
    }
    return trimmed as Username;
  }

  /**
   * Checks if a string is a valid username without throwing.
   */
  export function isValid(value: string): boolean {
    return PATTERN.test(value.trim());
  }
}

/**
 * Unique identifier for an Account in our database.
 *
 * Format: UUID v4
 * Example: "550e8400-e29b-41d4-a716-446655440000"
 *
 * Note: This is NOT the Starknet address. It's our internal ID for the account record.
 */
export type AccountId = string & { readonly __brand: 'AccountId' };

export namespace AccountId {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Creates an AccountId from an existing UUID string.
   *
   * @param uuid - UUID v4 string
   * @throws InvalidAccountIdError if not a valid UUID
   */
  export function of(uuid: string): AccountId {
    if (!UUID_REGEX.test(uuid)) {
      throw new InvalidAccountIdError(uuid);
    }
    return uuid as AccountId;
  }

  /**
   * Generates a new random AccountId.
   */
  export function generate(): AccountId {
    return crypto.randomUUID() as AccountId;
  }
}

/**
 * Starknet contract address.
 *
 * Format: 0x-prefixed hexadecimal string, normalized to 66 characters (0x + 64 hex).
 * Example: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
 */
export type StarknetAddress = string & { readonly __brand: 'StarknetAddress' };

export namespace StarknetAddress {
  const ADDRESS_REGEX = /^0x[a-fA-F0-9]{1,64}$/;

  /**
   * Creates a StarknetAddress from a hex string.
   *
   * @param hexAddress - Hex string with 0x prefix (e.g., "0x049d36...")
   * @returns Normalized StarknetAddress (lowercase, zero-padded to 66 chars)
   * @throws InvalidStarknetAddressError if the format is invalid
   */
  export function of(hexAddress: string): StarknetAddress {
    const trimmed = hexAddress.trim().toLowerCase();
    if (!ADDRESS_REGEX.test(trimmed)) {
      throw new InvalidStarknetAddressError(hexAddress);
    }
    // Normalize to full 66-character format (0x + 64 hex)
    const normalized = '0x' + trimmed.slice(2).padStart(64, '0');
    return normalized as StarknetAddress;
  }

  export function isValid(hexAddress: string): boolean {
    return ADDRESS_REGEX.test(hexAddress.trim());
  }
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
export type CredentialId = string & { readonly __brand: 'CredentialId' };

export namespace CredentialId {
  /**
   * Creates a CredentialId from a base64url-encoded string.
   *
   * @param base64UrlId - Base64URL-encoded credential ID from WebAuthn API
   * @throws ValidationError if empty
   */
  export function of(base64UrlId: string): CredentialId {
    if (!base64UrlId || base64UrlId.length === 0) {
      throw new ValidationError('credentialId', 'cannot be empty');
    }
    return base64UrlId as CredentialId;
  }
}

// =============================================================================
// Account Status
// =============================================================================

export type AccountStatus = 'pending' | 'deploying' | 'deployed' | 'failed';

// =============================================================================
// Errors
// =============================================================================

export class InvalidUsernameError extends DomainError {
  constructor(readonly value: string) {
    super(
      `Invalid username: "${value}". Must be 3-20 characters, alphanumeric and underscores only.`,
    );
  }
}

export class InvalidAccountIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid account ID format: ${value}`);
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

// =============================================================================
// DTOs
// =============================================================================

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
