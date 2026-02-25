import {DomainError} from '../shared';

/**
 * Bitcoin address (supports Bech32 and legacy formats).
 */
export type BitcoinAddress = string & { readonly __brand: 'BitcoinAddress' };

export namespace BitcoinAddress {
  // Bech32 mainnet (bc1) and testnet (tb1)
  const BECH32_REGEX = /^(bc1|tb1)[a-z0-9]{39,87}$/i;
  // Legacy P2PKH and P2SH
  const LEGACY_REGEX = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  // Testnet legacy
  const TESTNET_LEGACY_REGEX = /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

  export function of(value: string): BitcoinAddress {
    const trimmed = value.trim();
    if (!BitcoinAddress.isValid(trimmed)) {
      throw new InvalidBitcoinAddressError(value);
    }
    return trimmed as BitcoinAddress;
  }

  export function isValid(value: string): boolean {
    const trimmed = value.trim();
    return (
      BECH32_REGEX.test(trimmed) ||
      LEGACY_REGEX.test(trimmed) ||
      TESTNET_LEGACY_REGEX.test(trimmed)
    );
  }
}

export class InvalidBitcoinAddressError extends DomainError {
  constructor(readonly value: string) {
    super(`Invalid Bitcoin address format: ${value}`);
  }
}
