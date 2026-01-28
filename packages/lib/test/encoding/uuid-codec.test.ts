import {UuidCodec} from '@bim/lib/encoding';
import {describe, expect, it} from 'vitest';

describe('UuidCodec', () => {
  describe('toBytes', () => {
    it('converts UUID string to bytes', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = UuidCodec.toBytes(uuid);

      expect(result.length).toBe(16);
      expect(result[0]).toBe(0x55);
      expect(result[1]).toBe(0x0e);
      expect(result[2]).toBe(0x84);
      expect(result[3]).toBe(0x00);
    });

    it('handles UUID without dashes', () => {
      const uuid = '550e8400e29b41d4a716446655440000';
      const result = UuidCodec.toBytes(uuid);

      expect(result.length).toBe(16);
      expect(result[0]).toBe(0x55);
    });

    it('converts all zeros UUID', () => {
      const uuid = '00000000-0000-0000-0000-000000000000';
      const result = UuidCodec.toBytes(uuid);

      expect(result.length).toBe(16);
      expect(result.every((byte) => byte === 0)).toBe(true);
    });

    it('converts all ones UUID', () => {
      const uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const result = UuidCodec.toBytes(uuid);

      expect(result.length).toBe(16);
      expect(result.every((byte) => byte === 0xff)).toBe(true);
    });
  });

  describe('fromBytes', () => {
    it('converts bytes to UUID string with dashes', () => {
      const bytes = new Uint8Array([
        0x55, 0x0e, 0x84, 0x00,
        0xe2, 0x9b,
        0x41, 0xd4,
        0xa7, 0x16,
        0x44, 0x66, 0x55, 0x44, 0x00, 0x00
      ]);
      const result = UuidCodec.fromBytes(bytes);

      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('converts all zeros bytes to all zeros UUID', () => {
      const bytes = new Uint8Array(16).fill(0);
      const result = UuidCodec.fromBytes(bytes);

      expect(result).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('converts all ones bytes to all ones UUID', () => {
      const bytes = new Uint8Array(16).fill(0xff);
      const result = UuidCodec.fromBytes(bytes);

      expect(result).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
    });

    it('roundtrips with toBytes', () => {
      const originalUuid = '550e8400-e29b-41d4-a716-446655440000';
      const bytes = UuidCodec.toBytes(originalUuid);
      const resultUuid = UuidCodec.fromBytes(bytes);

      expect(resultUuid).toBe(originalUuid);
    });

    it('roundtrips random UUID', () => {
      const randomUuid = crypto.randomUUID();
      const bytes = UuidCodec.toBytes(randomUuid);
      const resultUuid = UuidCodec.fromBytes(bytes);

      expect(resultUuid).toBe(randomUuid);
    });
  });

  describe('toBase64Url', () => {
    it('converts a known UUID to base64url', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = UuidCodec.toBase64Url(uuid);

      expect(result).toBe('VQ6EAOKbQdSnFkRmVUQAAA');
    });

    it('produces a 22-character string without padding', () => {
      const uuid = crypto.randomUUID();
      const result = UuidCodec.toBase64Url(uuid);

      expect(result).toHaveLength(22);
      expect(result).not.toContain('=');
    });

    it('produces URL-safe characters only', () => {
      const uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const result = UuidCodec.toBase64Url(uuid);

      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
    });
  });
});
