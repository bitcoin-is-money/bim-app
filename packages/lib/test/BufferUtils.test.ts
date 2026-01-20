import {BufferUtils} from '@bim/lib';
import {describe, expect, it} from 'vitest';

describe('BufferUtils', () => {
  describe('bufferToBase64Url', () => {
    it('converts empty buffer to empty string', () => {
      const buffer = new ArrayBuffer(0);
      const result = BufferUtils.bufferToBase64Url(buffer);
      expect(result).toBe('');
    });

    it('converts buffer with known bytes to base64', () => {
      // "Hello" in bytes: [72, 101, 108, 108, 111]
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      const result = BufferUtils.bufferToBase64Url(bytes.buffer);
      expect(result).toBe('SGVsbG8=');
    });

    it('handles binary data correctly', () => {
      const bytes = new Uint8Array([0x00, 0xff, 0x7f, 0x80]);
      const result = BufferUtils.bufferToBase64Url(bytes.buffer);
      expect(result).toBe('AP9/gA==');
    });
  });

  describe('base64UrlToUint8Array', () => {
    it('converts empty string to empty array', () => {
      const result = BufferUtils.base64UrlToUint8Array('');
      expect(result).toEqual(new Uint8Array(0));
    });

    it('converts base64 string to Uint8Array', () => {
      // "SGVsbG8=" decodes to "Hello"
      const result = BufferUtils.base64UrlToUint8Array('SGVsbG8=');
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    it('handles binary data correctly', () => {
      const result = BufferUtils.base64UrlToUint8Array('AP9/gA==');
      expect(Array.from(result)).toEqual([0x00, 0xff, 0x7f, 0x80]);
    });

    it('roundtrips with bufferToBase64Url', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 100, 200, 255]);
      const base64 = BufferUtils.bufferToBase64Url(original.buffer);
      const decoded = BufferUtils.base64UrlToUint8Array(base64);
      expect(Array.from(decoded)).toEqual(Array.from(original));
    });
  });

  describe('uuidToBytes', () => {
    it('converts UUID string to bytes', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = BufferUtils.uuidToBytes(uuid);

      expect(result.length).toBe(16);
      expect(result[0]).toBe(0x55);
      expect(result[1]).toBe(0x0e);
      expect(result[2]).toBe(0x84);
      expect(result[3]).toBe(0x00);
    });

    it('handles UUID without dashes', () => {
      const uuid = '550e8400e29b41d4a716446655440000';
      const result = BufferUtils.uuidToBytes(uuid);

      expect(result.length).toBe(16);
      expect(result[0]).toBe(0x55);
    });

    it('converts all zeros UUID', () => {
      const uuid = '00000000-0000-0000-0000-000000000000';
      const result = BufferUtils.uuidToBytes(uuid);

      expect(result.length).toBe(16);
      expect(result.every((byte) => byte === 0)).toBe(true);
    });

    it('converts all ones UUID', () => {
      const uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const result = BufferUtils.uuidToBytes(uuid);

      expect(result.length).toBe(16);
      expect(result.every((byte) => byte === 0xff)).toBe(true);
    });
  });
});
