import {decode as hexDecode, encode as hexEncode} from '@stablelib/hex';

export namespace Hex {

  /**
   * Decodes a hex string into a Uint8Array.
   * Accepts an optional `0x` prefix and odd-length input (left-padded with `0`).
   */
  export function decode(hex: string): Uint8Array {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const padded = clean.length % 2 === 0 ? clean : `0${clean}`;
    return hexDecode(padded);
  }

  /**
   * Encodes a Uint8Array into a lowercase hex string (no `0x` prefix).
   */
  export function encode(bytes: Uint8Array): string {
    return hexEncode(bytes).toLowerCase();
  }

}
