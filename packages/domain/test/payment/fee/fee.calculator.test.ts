import {StarknetAddress} from '@bim/domain/account';
import {FeeCalculator, FeeConfig} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {describe, expect, it} from 'vitest';

describe('FeeCalculator', () => {
  describe('calculateFee', () => {
    it('calculates 0.1% fee correctly', () => {
      // 0.1% of 1 BTC (100,000,000 sats)
      const amount = Amount.ofSatoshi(100_000_000n);
      const percentage = 0.001; // 0.1%

      const fee = FeeCalculator.calculateFee(amount, percentage);

      expect(fee.getSat()).toBe(100_000n); // 0.001 BTC
    });

    it('calculates 1% fee correctly', () => {
      const amount = Amount.ofSatoshi(100_000_000n);
      const percentage = 0.01; // 1%

      const fee = FeeCalculator.calculateFee(amount, percentage);

      expect(fee.getSat()).toBe(1_000_000n); // 0.01 BTC
    });

    it('calculates fee for small amounts', () => {
      // 0.1% of 100,000 sats
      const amount = Amount.ofSatoshi(100_000n);
      const percentage = 0.001;

      const fee = FeeCalculator.calculateFee(amount, percentage);

      expect(fee.getSat()).toBe(100n);
    });

    it('returns zero for zero amount', () => {
      const fee = FeeCalculator.calculateFee(Amount.zero(), 0.001);
      expect(fee.isZero()).toBe(true);
    });

    it('returns zero for zero percentage', () => {
      const fee = FeeCalculator.calculateFee(Amount.ofSatoshi(1_000_000n), 0);
      expect(fee.isZero()).toBe(true);
    });

    it('returns zero for negative percentage', () => {
      const fee = FeeCalculator.calculateFee(Amount.ofSatoshi(1_000_000n), -0.01);
      expect(fee.isZero()).toBe(true);
    });

    it('handles very small percentages (0.01%)', () => {
      const amount = Amount.ofSatoshi(100_000_000n); // 1 BTC
      const percentage = 0.0001; // 0.01%

      const fee = FeeCalculator.calculateFee(amount, percentage);

      expect(fee.getSat()).toBe(10_000n); // 0.0001 BTC
    });

    it('handles satoshi amounts', () => {
      // 0.1% of 1 BTC = 100,000,000 sats
      const amount = Amount.ofSatoshi(100_000_000n);
      const percentage = 0.001;

      const fee = FeeCalculator.calculateFee(amount, percentage);

      expect(fee.getSat()).toBe(100_000n);
    });

    it('rounds down for precision (no fractional sats)', () => {
      // 999 mSat * 0.001 = 0.999 mSat, should round down to 0
      const amount = Amount.ofMilliSatoshi(999n);
      const percentage = 0.001;

      const fee = FeeCalculator.calculateFee(amount, percentage);

      expect(fee.isZero()).toBe(true);
    });

    it('maintains precision for larger amounts with fractional results', () => {
      // 1001 mSat * 0.001 = 1.001 mSat, should round down to 1
      const amount = Amount.ofMilliSatoshi(1001n);
      const percentage = 0.001;

      const fee = FeeCalculator.calculateFee(amount, percentage);

      expect(fee.getMSat()).toBe(1n);
    });
  });
});

describe('FeeConfig', () => {
  describe('create', () => {
    it('creates config with valid percentage', () => {
      const config = FeeConfig.create({
        percentage: 0.001,
        recipientAddress: StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0'),
      });

      expect(config.percentage).toBe(0.001);
    });

    it('throws for percentage > 1', () => {
      expect(() =>
        FeeConfig.create({
          percentage: 1.5,
          recipientAddress: StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0'),
        })
      ).toThrow('Invalid fee percentage');
    });

    it('throws for negative percentage', () => {
      expect(() =>
        FeeConfig.create({
          percentage: -0.01,
          recipientAddress: StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0'),
        })
      ).toThrow('Invalid fee percentage');
    });

    it('allows 0% fee', () => {
      const config = FeeConfig.create({
        percentage: 0,
        recipientAddress: StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0'),
      });

      expect(config.percentage).toBe(0);
    });

    it('allows 100% fee', () => {
      const config = FeeConfig.create({
        percentage: 1,
        recipientAddress: StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0'),
      });

      expect(config.percentage).toBe(1);
    });
  });

  it('exposes DEFAULT_PERCENTAGE constant', () => {
    expect(FeeConfig.DEFAULT_PERCENTAGE).toBe(0.001);
  });
});
