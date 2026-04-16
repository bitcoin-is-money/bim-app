import {formatSats, formatStrk, formatTokenAmount, formatWbtc} from '@bim/lib/token';
import {describe, expect, it} from 'vitest';

describe('formatTokenAmount', () => {
  describe('default behavior (fractionDigits = decimals)', () => {
    it('formats zero with full decimals', () => {
      expect(formatTokenAmount(0n, 18)).toBe('0.000000000000000000');
    });

    it('formats an 18-decimal value preserving every digit', () => {
      expect(formatTokenAmount(66_041_022_140_453_590_000n, 18)).toBe('66.041022140453590000');
    });

    it('accepts a decimal-string input', () => {
      expect(formatTokenAmount('66041022140453590000', 18)).toBe('66.041022140453590000');
    });

    it('handles decimals=0 as a plain integer', () => {
      expect(formatTokenAmount(12_345n, 0)).toBe('12345');
    });

    it('handles values below 1 (pads the fraction with leading zeros)', () => {
      expect(formatTokenAmount(5n, 18)).toBe('0.000000000000000005');
    });
  });

  describe('fractionDigits option', () => {
    it('truncates (does not round) to the requested fraction width', () => {
      expect(formatTokenAmount(66_049_999_999_999_999_999n, 18, {fractionDigits: 2}))
        .toBe('66.04');
    });

    it('pads the fraction when fractionDigits > available digits', () => {
      expect(formatTokenAmount(12_300n, 2, {fractionDigits: 6})).toBe('123.000000');
    });

    it('drops the fraction when fractionDigits is 0', () => {
      expect(formatTokenAmount(66_999_999_999_999_999_999n, 18, {fractionDigits: 0})).toBe('66');
    });

    it('matches the domain formatStrk contract (18 decimals, 6 fraction digits)', () => {
      expect(formatTokenAmount(1_234_567_890_123_456_789n, 18, {fractionDigits: 6}))
        .toBe('1.234567');
    });
  });

  describe('displayUnit option', () => {
    it('appends the unit symbol after a single space', () => {
      expect(formatTokenAmount(1_000_000_000_000_000_000n, 18, {fractionDigits: 6, displayUnit: 'STRK'}))
        .toBe('1.000000 STRK');
    });

    it('is ignored when empty', () => {
      expect(formatTokenAmount(10_000n, 0, {displayUnit: ''})).toBe('10000');
    });
  });

  describe('omitZeroFraction option', () => {
    it('omits the dot when the displayed fraction is entirely zero', () => {
      expect(formatTokenAmount('66000000000000000000', 18, {fractionDigits: 2, omitZeroFraction: true}))
        .toBe('66');
    });

    it('preserves trailing zeros inside a non-zero fraction', () => {
      expect(formatTokenAmount('66400000000000000000', 18, {fractionDigits: 2, omitZeroFraction: true}))
        .toBe('66.40');
    });

    it('returns "0" for a zero input when enabled', () => {
      expect(formatTokenAmount(0n, 18, {fractionDigits: 2, omitZeroFraction: true})).toBe('0');
    });

    it('keeps the dot when disabled even for an all-zero fraction', () => {
      expect(formatTokenAmount(0n, 18, {fractionDigits: 2})).toBe('0.00');
    });
  });
});

describe('formatStrk', () => {
  it('formats wei to 6 fraction digits', () => {
    expect(formatStrk(1_000_000_000_000_000_000n)).toBe('1.000000');
    expect(formatStrk(123_456_789_012_345_678n)).toBe('0.123456');
    expect(formatStrk(0n)).toBe('0.000000');
  });

  it('appends the STRK unit when withUnit is true', () => {
    expect(formatStrk(1_000_000_000_000_000_000n, true)).toBe('1.000000 STRK');
    expect(formatStrk(0n, true)).toBe('0.000000 STRK');
  });
});

describe('formatWbtc', () => {
  it('formats sats to 8 fraction digits', () => {
    expect(formatWbtc(100_000_000n)).toBe('1.00000000');
    expect(formatWbtc(10_000n)).toBe('0.00010000');
    expect(formatWbtc(0n)).toBe('0.00000000');
  });

  it('appends the WBTC unit when withUnit is true', () => {
    expect(formatWbtc(100_000_000n, true)).toBe('1.00000000 WBTC');
  });
});

describe('formatSats', () => {
  it('formats sats as a plain integer string', () => {
    expect(formatSats(10_000n)).toBe('10000');
    expect(formatSats(0n)).toBe('0');
    expect(formatSats(12_345_678_901n)).toBe('12345678901');
  });

  it('appends the sats unit when withUnit is true', () => {
    expect(formatSats(10_000n, true)).toBe('10000 sats');
    expect(formatSats(0n, true)).toBe('0 sats');
  });
});
