import {InvalidStarknetAddressError} from '../account/errors';

/**
 * Starknet contract address.
 *
 * Format: 0x-prefixed hexadecimal string, normalized to 66 characters (0x + 64 hex).
 * Example: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
 */
export type StarknetAddress = string & { readonly __brand: 'StarknetAddress' };

export namespace StarknetAddress {
  const ADDRESS_REGEX = /^0x[a-fA-F0-9]{1,64}$/;

  /** Stark field prime: P = 2^251 + 17 * 2^192 + 1 */
    const FELT_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

  /**
   * Creates a StarknetAddress from a hex string.
   *
   * @param hexAddress - Hex string with 0x prefix (e.g., "0x049d36...")
   * @returns Normalized StarknetAddress (lowercase, zero-padded to 66 chars)
   * @throws InvalidStarknetAddressError if the format is invalid or value >= felt prime
   */
  export function of(hexAddress: string): StarknetAddress {
    const trimmed = hexAddress.trim().toLowerCase();
    if (!isValid(trimmed)) {
      throw new InvalidStarknetAddressError(hexAddress);
    }
    // Normalize to full 66-character format (0x + 64 hex)
    const normalized = '0x' + trimmed.slice(2).padStart(64, '0');
    return normalized as StarknetAddress;
  }

  /**
   * Checks if a string is a valid Starknet address.
   * Must be a 0x-prefixed hex string representing a felt252 (< Stark field prime).
   */
  export function isValid(hexAddress: string): boolean {
    const trimmed = hexAddress.trim();
    if (!ADDRESS_REGEX.test(trimmed)) {
      return false;
    }
    const value = BigInt(trimmed);
    return value > 0n && value < FELT_PRIME;
  }
}
