import {Amount, ValidationError} from '@bim/domain/shared';
import {describe, expect, it} from 'vitest';

describe('Amount', () => {
  describe('factory methods', () => {
    describe('ofMilliSatoshi', () => {
      it('creates amount from mSat', () => {
        const amount = Amount.ofMilliSatoshi(5000n);
        expect(amount.getMSat()).toBe(5000n);
      });

      it('accepts zero', () => {
        const amount = Amount.ofMilliSatoshi(0n);
        expect(amount.getMSat()).toBe(0n);
      });

      it('throws for negative value', () => {
        expect(() => Amount.ofMilliSatoshi(-1n)).toThrow(ValidationError);
      });
    });

    describe('ofSatoshi', () => {
      it('converts sats to mSat (1 sat = 1000 mSat)', () => {
        const amount = Amount.ofSatoshi(1n);
        expect(amount.getMSat()).toBe(1_000n);
      });

      it('converts larger amounts correctly', () => {
        const amount = Amount.ofSatoshi(100_000_000n); // 1 BTC
        expect(amount.getMSat()).toBe(100_000_000_000n);
      });

      it('accepts zero', () => {
        const amount = Amount.ofSatoshi(0n);
        expect(amount.getMSat()).toBe(0n);
      });

      it('throws for negative value', () => {
        expect(() => Amount.ofSatoshi(-1n)).toThrow(ValidationError);
      });
    });

    describe('fromBtcString', () => {
      it('parses whole BTC amount', () => {
        const amount = Amount.fromBtcString('1');
        expect(amount.getSat()).toBe(100_000_000n);
      });

      it('parses fractional BTC amount', () => {
        const amount = Amount.fromBtcString('0.001');
        expect(amount.getSat()).toBe(100_000n);
      });

      it('parses 1 satoshi', () => {
        const amount = Amount.fromBtcString('0.00000001');
        expect(amount.getSat()).toBe(1n);
      });

      it('parses BTC amount with full 8 decimal places', () => {
        const amount = Amount.fromBtcString('1.23456789');
        expect(amount.getSat()).toBe(123_456_789n);
      });

      it('handles trailing zeros correctly', () => {
        const amount = Amount.fromBtcString('0.10000000');
        expect(amount.getSat()).toBe(10_000_000n);
      });

      it('throws for more than 8 decimal places', () => {
        expect(() => Amount.fromBtcString('0.123456789')).toThrow(ValidationError);
      });

      it('throws for negative amount', () => {
        expect(() => Amount.fromBtcString('-0.001')).toThrow(ValidationError);
      });

      it('throws for non-numeric string', () => {
        expect(() => Amount.fromBtcString('abc')).toThrow(ValidationError);
      });
    });

    describe('zero', () => {
      it('creates a zero amount', () => {
        const amount = Amount.zero();
        expect(amount.getMSat()).toBe(0n);
        expect(amount.isZero()).toBe(true);
      });
    });
  });

  describe('accessors', () => {
    describe('getMSat', () => {
      it('returns mSat value', () => {
        expect(Amount.ofMilliSatoshi(42n).getMSat()).toBe(42n);
      });
    });

    describe('getSat', () => {
      it('converts mSat to sats with integer division', () => {
        expect(Amount.ofMilliSatoshi(5_000n).getSat()).toBe(5n);
      });

      it('truncates sub-sat amounts', () => {
        expect(Amount.ofMilliSatoshi(999n).getSat()).toBe(0n);
        expect(Amount.ofMilliSatoshi(1_500n).getSat()).toBe(1n);
        expect(Amount.ofMilliSatoshi(2_999n).getSat()).toBe(2n);
      });

      it('round-trips from ofSatoshi', () => {
        const sats = 123_456n;
        expect(Amount.ofSatoshi(sats).getSat()).toBe(sats);
      });
    });

    describe('getBitcoin', () => {
      it('converts to BTC for display', () => {
        const oneBtc = Amount.ofSatoshi(100_000_000n);
        expect(oneBtc.getBitcoin()).toBeCloseTo(1.0, 10);
      });

      it('handles fractional BTC', () => {
        const amount = Amount.ofSatoshi(50_000n); // 0.0005 BTC
        expect(amount.getBitcoin()).toBeCloseTo(0.0005, 10);
      });

      it('returns 0 for zero', () => {
        expect(Amount.zero().getBitcoin()).toBe(0);
      });
    });
  });

  describe('arithmetic', () => {
    describe('add', () => {
      it('adds two amounts', () => {
        const result = Amount.ofSatoshi(100n).add(Amount.ofSatoshi(200n));
        expect(result.getSat()).toBe(300n);
      });

      it('adds zero correctly', () => {
        const amount = Amount.ofSatoshi(100n);
        expect(amount.add(Amount.zero()).getSat()).toBe(100n);
      });

      it('preserves mSat precision', () => {
        const result = Amount.ofMilliSatoshi(500n).add(Amount.ofMilliSatoshi(700n));
        expect(result.getMSat()).toBe(1_200n);
      });
    });

    describe('subtract', () => {
      it('subtracts two amounts', () => {
        const result = Amount.ofSatoshi(300n).subtract(Amount.ofSatoshi(100n));
        expect(result.getSat()).toBe(200n);
      });

      it('subtracting zero returns same value', () => {
        const amount = Amount.ofSatoshi(100n);
        expect(amount.subtract(Amount.zero()).getSat()).toBe(100n);
      });

      it('subtracting equal amounts returns zero', () => {
        const amount = Amount.ofSatoshi(100n);
        expect(amount.subtract(amount).isZero()).toBe(true);
      });

      it('throws when result would be negative', () => {
        expect(() =>
          Amount.ofSatoshi(100n).subtract(Amount.ofSatoshi(200n)),
        ).toThrow(ValidationError);
      });
    });

    describe('percentage', () => {
      it('calculates 0.1% correctly', () => {
        const amount = Amount.ofSatoshi(100_000_000n); // 1 BTC
        const fee = amount.percentage(0.001);
        expect(fee.getSat()).toBe(100_000n);
      });

      it('calculates 1% correctly', () => {
        const amount = Amount.ofSatoshi(100_000_000n);
        const fee = amount.percentage(0.01);
        expect(fee.getSat()).toBe(1_000_000n);
      });

      it('calculates 100%', () => {
        const amount = Amount.ofSatoshi(50_000n);
        const result = amount.percentage(1.0);
        expect(result.getSat()).toBe(50_000n);
      });

      it('returns zero for 0%', () => {
        const amount = Amount.ofSatoshi(100_000_000n);
        expect(amount.percentage(0).isZero()).toBe(true);
      });

      it('returns zero for zero amount', () => {
        expect(Amount.zero().percentage(0.5).isZero()).toBe(true);
      });

      it('rounds down for sub-mSat results', () => {
        // 999 mSat * 0.001 = 0.999 mSat → 0
        const amount = Amount.ofMilliSatoshi(999n);
        expect(amount.percentage(0.001).isZero()).toBe(true);
      });

      it('handles small percentages (0.01%)', () => {
        const amount = Amount.ofSatoshi(100_000_000n);
        const fee = amount.percentage(0.0001);
        expect(fee.getSat()).toBe(10_000n);
      });

      it('throws for negative percentage', () => {
        expect(() =>
          Amount.ofSatoshi(1000n).percentage(-0.01),
        ).toThrow(ValidationError);
      });
    });
  });

  describe('comparisons', () => {
    const small = Amount.ofSatoshi(100n);
    const medium = Amount.ofSatoshi(500n);
    const large = Amount.ofSatoshi(1000n);
    const zero = Amount.zero();

    describe('isZero', () => {
      it('returns true for zero', () => {
        expect(zero.isZero()).toBe(true);
      });

      it('returns false for non-zero', () => {
        expect(small.isZero()).toBe(false);
      });
    });

    describe('isPositive', () => {
      it('returns true for positive amount', () => {
        expect(small.isPositive()).toBe(true);
      });

      it('returns false for zero', () => {
        expect(zero.isPositive()).toBe(false);
      });
    });

    describe('isGreaterThan', () => {
      it('returns true when greater', () => {
        expect(large.isGreaterThan(small)).toBe(true);
      });

      it('returns false when equal', () => {
        expect(medium.isGreaterThan(Amount.ofSatoshi(500n))).toBe(false);
      });

      it('returns false when less', () => {
        expect(small.isGreaterThan(large)).toBe(false);
      });
    });

    describe('isGreaterThanOrEqual', () => {
      it('returns true when greater', () => {
        expect(large.isGreaterThanOrEqual(small)).toBe(true);
      });

      it('returns true when equal', () => {
        expect(medium.isGreaterThanOrEqual(Amount.ofSatoshi(500n))).toBe(true);
      });

      it('returns false when less', () => {
        expect(small.isGreaterThanOrEqual(large)).toBe(false);
      });
    });

    describe('isLessThan', () => {
      it('returns true when less', () => {
        expect(small.isLessThan(large)).toBe(true);
      });

      it('returns false when equal', () => {
        expect(medium.isLessThan(Amount.ofSatoshi(500n))).toBe(false);
      });

      it('returns false when greater', () => {
        expect(large.isLessThan(small)).toBe(false);
      });
    });

    describe('isLessThanOrEqual', () => {
      it('returns true when less', () => {
        expect(small.isLessThanOrEqual(large)).toBe(true);
      });

      it('returns true when equal', () => {
        expect(medium.isLessThanOrEqual(Amount.ofSatoshi(500n))).toBe(true);
      });

      it('returns false when greater', () => {
        expect(large.isLessThanOrEqual(small)).toBe(false);
      });
    });

    describe('equals', () => {
      it('returns true for equal amounts', () => {
        expect(Amount.ofSatoshi(100n).equals(Amount.ofSatoshi(100n))).toBe(true);
      });

      it('returns true for equivalent mSat and sats', () => {
        expect(Amount.ofMilliSatoshi(5_000n).equals(Amount.ofSatoshi(5n))).toBe(true);
      });

      it('returns false for different amounts', () => {
        expect(small.equals(large)).toBe(false);
      });
    });
  });

  describe('serialization', () => {
    describe('toSatString', () => {
      it('returns sat value as decimal string', () => {
        expect(Amount.ofSatoshi(123_456_789n).toSatString()).toBe('123456789');
      });

      it('returns "0" for zero', () => {
        expect(Amount.zero().toSatString()).toBe('0');
      });

      it('truncates sub-sat mSat', () => {
        expect(Amount.ofMilliSatoshi(1_500n).toSatString()).toBe('1');
      });
    });

    describe('toString', () => {
      it('returns human-readable format', () => {
        expect(Amount.ofSatoshi(1n).toString()).toBe('1000 mSat');
      });

      it('returns "0 mSat" for zero', () => {
        expect(Amount.zero().toString()).toBe('0 mSat');
      });
    });
  });
});
