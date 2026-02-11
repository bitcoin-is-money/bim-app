import {describe, expect, it} from 'vitest';
import {decodeU256, normalizeAddress} from '../../src/starknet.js';

describe('normalizeAddress', () => {
  it('pads short hex to 66 chars', () => {
    expect(normalizeAddress('0x123')).toBe('0x' + '0'.repeat(61) + '123');
  });

  it('handles full-length address unchanged', () => {
    const addr = '0x' + 'a'.repeat(64);
    expect(normalizeAddress(addr)).toBe(addr);
  });

  it('lowercases hex digits', () => {
    expect(normalizeAddress('0xABC')).toBe('0x' + '0'.repeat(61) + 'abc');
  });

  it('handles bigint input', () => {
    expect(normalizeAddress(255n)).toBe('0x' + '0'.repeat(62) + 'ff');
  });

  it('handles hex without 0x prefix', () => {
    expect(normalizeAddress('abc')).toBe('0x' + '0'.repeat(61) + 'abc');
  });

  it('handles zero', () => {
    expect(normalizeAddress('0x0')).toBe('0x' + '0'.repeat(64));
  });

  it('handles bigint zero', () => {
    expect(normalizeAddress(0n)).toBe('0x' + '0'.repeat(64));
  });
});

describe('decodeU256', () => {
  it('decodes simple value (high = 0)', () => {
    expect(decodeU256('0x1000', '0x0')).toBe('4096');
  });

  it('decodes value with high part only', () => {
    expect(decodeU256('0x0', '0x1')).toBe((1n << 128n).toString());
  });

  it('combines low and high', () => {
    expect(decodeU256('0x5', '0x2')).toBe((5n + (2n << 128n)).toString());
  });

  it('handles bigint input', () => {
    expect(decodeU256(1000n, 0n)).toBe('1000');
  });

  it('handles zero', () => {
    expect(decodeU256('0x0', '0x0')).toBe('0');
  });

  it('handles large values', () => {
    const maxU128 = (1n << 128n) - 1n;
    expect(decodeU256(maxU128, maxU128)).toBe(((1n << 256n) - 1n).toString());
  });
});
