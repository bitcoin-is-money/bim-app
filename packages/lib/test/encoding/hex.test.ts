import {Hex} from '@bim/lib/encoding';
import {describe, expect, it} from 'vitest';

describe('Hex', () => {
  describe('decode', () => {
    it('decodes an empty string to an empty array', () => {
      expect(Hex.decode('')).toEqual(new Uint8Array(0));
    });

    it('decodes a lowercase hex string', () => {
      expect(Array.from(Hex.decode('48656c6c6f'))).toEqual([72, 101, 108, 108, 111]);
    });

    it('decodes an uppercase hex string', () => {
      expect(Array.from(Hex.decode('48656C6C6F'))).toEqual([72, 101, 108, 108, 111]);
    });

    it('strips a 0x prefix', () => {
      expect(Array.from(Hex.decode('0x48656c6c6f'))).toEqual([72, 101, 108, 108, 111]);
    });

    it('left-pads an odd-length input', () => {
      expect(Array.from(Hex.decode('abc'))).toEqual([0x0a, 0xbc]);
    });

    it('left-pads an odd-length input with a 0x prefix', () => {
      expect(Array.from(Hex.decode('0xabc'))).toEqual([0x0a, 0xbc]);
    });

    it('handles binary boundaries correctly', () => {
      expect(Array.from(Hex.decode('00ff7f80'))).toEqual([0x00, 0xff, 0x7f, 0x80]);
    });
  });

  describe('encode', () => {
    it('encodes an empty array to an empty string', () => {
      expect(Hex.encode(new Uint8Array(0))).toBe('');
    });

    it('encodes bytes to a lowercase hex string', () => {
      expect(Hex.encode(new Uint8Array([0x00, 0xff, 0x7f, 0x80]))).toBe('00ff7f80');
    });

    it('roundtrips with decode', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 100, 200, 255]);
      expect(Array.from(Hex.decode(Hex.encode(original)))).toEqual(Array.from(original));
    });
  });
});
