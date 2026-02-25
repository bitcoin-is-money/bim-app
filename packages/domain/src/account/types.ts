import {DomainError, ValidationError} from '../shared';

// =============================================================================
// Branded Types
// =============================================================================

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

export class InvalidAccountIdError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid account ID format: ${value}`);
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
