import {Base64Url} from './base64url';

export namespace UuidCodec {

  /**
   * Converts a UUID string (with or without dashes) to a 16-byte Uint8Array.
   */
  export function toBytes(uuid: string): Uint8Array {
    const hex = uuid.replaceAll('-', '');
    const bytes = new Uint8Array(hex.length / 2);
    for (let idx = 0; idx < hex.length; idx += 2) {
      bytes[idx / 2] = Number.parseInt(hex.slice(idx, idx + 2), 16);
    }
    return bytes;
  }

  /**
   * Converts a 16-byte Uint8Array back to a UUID string with dashes (8-4-4-4-12).
   */
  export function fromBytes(bytes: Uint8Array): string {
    const hex = Array.from(bytes)
      .map((byte) => byte
        .toString(16)
        .padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  /**
   * Converts a UUID string to its base64url representation (22 characters, no padding).
   */
  export function toBase64Url(uuid: string): string {
    return Base64Url.encode(toBytes(uuid).buffer as ArrayBuffer);
  }

}
