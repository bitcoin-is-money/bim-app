import {Base64Url} from '@bim/lib/encoding';
import {describe, expect, it} from 'vitest';

describe('Base64Url', () => {
  describe('encode', () => {
    it('converts empty buffer to empty string', () => {
      const buffer = new ArrayBuffer(0);
      const result = Base64Url.encode(buffer);
      expect(result).toBe('');
    });

    it('converts buffer with known bytes to base64url', () => {
      // "Hello" in bytes: [72, 101, 108, 108, 111]
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      const result = Base64Url.encode(bytes.buffer);
      // base64url: no padding, - instead of +, _ instead of /
      expect(result).toBe('SGVsbG8');
    });

    it('handles binary data correctly', () => {
      const bytes = new Uint8Array([0x00, 0xff, 0x7f, 0x80]);
      const result = Base64Url.encode(bytes.buffer);
      // base64url: _ instead of /, no padding
      expect(result).toBe('AP9_gA');
    });
  });

  describe('decode', () => {
    it('converts empty string to empty array', () => {
      const result = Base64Url.decode('');
      expect(result).toEqual(new Uint8Array(0));
    });

    it('converts base64 string to Uint8Array', () => {
      // "SGVsbG8=" decodes to "Hello"
      const result = Base64Url.decode('SGVsbG8=');
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    it('handles binary data correctly (standard base64)', () => {
      const result = Base64Url.decode('AP9/gA==');
      expect(Array.from(result)).toEqual([0x00, 0xff, 0x7f, 0x80]);
    });

    it('handles binary data correctly (base64url)', () => {
      // base64url: _ instead of /, no padding
      const result = Base64Url.decode('AP9_gA');
      expect(Array.from(result)).toEqual([0x00, 0xff, 0x7f, 0x80]);
    });

    it('roundtrips with encode', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 100, 200, 255]);
      const base64 = Base64Url.encode(original.buffer);
      const decoded = Base64Url.decode(base64);
      expect(Array.from(decoded)).toEqual(Array.from(original));
    });
  });
});
