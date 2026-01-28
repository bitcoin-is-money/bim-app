import {decode as b64Decode, encode as b64Encode} from '@stablelib/base64';

export namespace Base64Url {

  /**
   * Encodes an ArrayBuffer into a base64url string (URL-safe, no padding).
   */
  export function encode(buffer: ArrayBuffer): string {
    return b64Encode(new Uint8Array(buffer))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  }

  /**
   * Decodes a base64url string (or standard base64) into a Uint8Array.
   * Handles both padded and unpadded input.
   */
  export function decode(base64Url: string): Uint8Array {
    const base64 = base64Url
      .replaceAll('-', '+')
      .replaceAll('_', '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return b64Decode(padded);
  }

}
