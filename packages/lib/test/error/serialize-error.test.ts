import {serializeError} from '@bim/lib/error';
import {describe, expect, it} from 'vitest';

describe('serializeError', () => {
  it('extracts message from Error instances', () => {
    expect(serializeError(new Error('boom'))).toBe('boom');
  });

  it('extracts message from Error subclasses', () => {
    expect(serializeError(new TypeError('bad type'))).toBe('bad type');
    expect(serializeError(new RangeError('out of range'))).toBe('out of range');
  });

  it('returns strings as-is', () => {
    expect(serializeError('plain string')).toBe('plain string');
    expect(serializeError('')).toBe('');
  });

  it('JSON-serializes plain objects', () => {
    expect(serializeError({code: 42, msg: 'fail'})).toBe('{"code":42,"msg":"fail"}');
  });

  it('JSON-serializes arrays', () => {
    expect(serializeError([1, 2, 3])).toBe('[1,2,3]');
  });

  it('JSON-serializes null', () => {
    expect(serializeError(null)).toBe('null');
  });

  it('handles undefined via String() fallback', () => {
    // JSON.stringify(undefined) returns undefined (not a string),
    // so it falls through to String()
    expect(serializeError(undefined)).toBe('undefined');
  });

  it('handles numbers', () => {
    expect(serializeError(42)).toBe('42');
    expect(serializeError(0)).toBe('0');
  });

  it('handles booleans', () => {
    expect(serializeError(true)).toBe('true');
    expect(serializeError(false)).toBe('false');
  });

  it('falls back to String() for circular references', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = serializeError(circular);
    expect(result).toBe('[object Object]');
  });

  it('handles BigInt via String() fallback', () => {
    // JSON.stringify(BigInt) throws, so we fall back to String()
    expect(serializeError(42n)).toBe('42');
  });
});
