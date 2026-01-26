import {decode, encode} from '@stablelib/base64';

export namespace BufferUtils {

  export function bufferToBase64Url(buffer: ArrayBuffer): string {
    return encode(new Uint8Array(buffer));
  }

  export function base64UrlToUint8Array(base64Url: string): Uint8Array {
    return decode(base64Url);
  }

  /**
   * Convert UUID string to Uint8Array
   * Remove dashes and convert hex pairs to bytes
   */
  export function uuidToBytes(str: string): Uint8Array {
    const hex = str.replaceAll('-', '');
    const bytes = new Uint8Array(hex.length / 2);
    for (let idx = 0; idx < hex.length; idx += 2) {
      bytes[idx / 2] = Number.parseInt(hex.slice(idx, idx + 2), 16);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array (16 bytes) back to UUID string
   * Inserts dashes at the correct positions: 8-4-4-4-12
   */
  export function bytesToUuid(bytes: Uint8Array): string {
    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }


}
