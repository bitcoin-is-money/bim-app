import {BitcoinAddressNetworkMismatchError, InvalidBitcoinAddressError} from '../swap/errors';
import type {BitcoinNetwork} from './network';

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

  function isMainnetAddress(value: string): boolean {
    return /^bc1/i.test(value) || /^[13]/.test(value);
  }

  function isTestnetAddress(value: string): boolean {
    return /^tb1/i.test(value) || /^[mn2]/.test(value);
  }

  export function of(value: string, network?: BitcoinNetwork): BitcoinAddress {
    const trimmed = value.trim();
    if (!BitcoinAddress.isValid(trimmed)) {
      throw new InvalidBitcoinAddressError(value);
    }
    if (network) {
      const addressIsMainnet = isMainnetAddress(trimmed);
      const addressIsTestnet = isTestnetAddress(trimmed);
      const actualNetwork = addressIsMainnet ? 'mainnet' : 'testnet';
      if (network === 'mainnet' && addressIsTestnet) {
        throw new BitcoinAddressNetworkMismatchError(trimmed, 'mainnet', 'testnet');
      }
      if (network === 'testnet' && addressIsMainnet) {
        throw new BitcoinAddressNetworkMismatchError(trimmed, 'testnet', actualNetwork);
      }
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
