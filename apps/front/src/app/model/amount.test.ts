import {describe, expect, it} from 'vitest';
import {Amount} from './amount';
import {ConversionRates, Currency} from './currency';

const RATES: ConversionRates = {BTC_USD: 100_000};

describe('Amount', () => {
  describe('zero', () => {
    it('should create a zero amount with default currency USD', () => {
      const amount = Amount.zero();
      expect(amount.value).toBe(0);
      expect(amount.currency).toBe('USD');
    });

    it('should create a zero amount with specified currency', () => {
      const amount = Amount.zero('SAT');
      expect(amount.value).toBe(0);
      expect(amount.currency).toBe('SAT');
    });
  });

  describe('of', () => {
    it('should create an amount with given value and currency', () => {
      const amount = Amount.of(42, 'BTC');
      expect(amount.value).toBe(42);
      expect(amount.currency).toBe('BTC');
    });
  });

  describe('clone', () => {
    it('should return a new instance with same value and currency', () => {
      const original = Amount.of(100, 'USD');
      const cloned = original.clone();
      expect(cloned.value).toBe(100);
      expect(cloned.currency).toBe('USD');
      expect(cloned).not.toBe(original);
    });
  });

  describe('convert', () => {
    it('should return a clone when converting to same currency', () => {
      const amount = Amount.of(500, 'USD');
      const result = amount.convert('USD', RATES);
      expect(result.value).toBe(500);
      expect(result.currency).toBe('USD');
      expect(result).not.toBe(amount);
    });

    it('should keep value unchanged when BTC_USD rate is 0', () => {
      const amount = Amount.of(500, 'USD');
      const result = amount.convert('SAT', {BTC_USD: 0});
      expect(result.value).toBe(500);
      expect(result.currency).toBe('SAT');
    });

    // SAT → USD
    it('should convert SAT to USD', () => {
      const amount = Amount.of(Currency.SATS_PER_BTC, 'SAT'); // 1 BTC in sats
      const result = amount.convert('USD', RATES);
      expect(result.value).toBe(100_000);
      expect(result.currency).toBe('USD');
    });

    // USD → SAT
    it('should convert USD to SAT', () => {
      const amount = Amount.of(100_000, 'USD'); // 1 BTC worth
      const result = amount.convert('SAT', RATES);
      expect(result.value).toBe(Currency.SATS_PER_BTC);
      expect(result.currency).toBe('SAT');
    });

    // BTC → USD
    it('should convert BTC to USD', () => {
      const amount = Amount.of(2, 'BTC');
      const result = amount.convert('USD', RATES);
      expect(result.value).toBe(200_000);
      expect(result.currency).toBe('USD');
    });

    // USD → BTC
    it('should convert USD to BTC', () => {
      const amount = Amount.of(100_000, 'USD');
      const result = amount.convert('BTC', RATES);
      expect(result.value).toBe(1);
      expect(result.currency).toBe('BTC');
    });

    // BTC → SAT
    it('should convert BTC to SAT', () => {
      const amount = Amount.of(1, 'BTC');
      const result = amount.convert('SAT', RATES);
      expect(result.value).toBe(Currency.SATS_PER_BTC);
      expect(result.currency).toBe('SAT');
    });

    // SAT → BTC
    it('should convert SAT to BTC', () => {
      const amount = Amount.of(Currency.SATS_PER_BTC, 'SAT');
      const result = amount.convert('BTC', RATES);
      expect(result.value).toBe(1);
      expect(result.currency).toBe('BTC');
    });

    // Round-trip conversions
    it('should preserve value through round-trip SAT → USD → SAT', () => {
      const original = Amount.of(50_000_000, 'SAT');
      const inUsd = original.convert('USD', RATES);
      const backToSat = inUsd.convert('SAT', RATES);
      expect(backToSat.value).toBeCloseTo(50_000_000);
      expect(backToSat.currency).toBe('SAT');
    });

    it('should preserve value through round-trip BTC → USD → BTC', () => {
      const original = Amount.of(0.5, 'BTC');
      const inUsd = original.convert('USD', RATES);
      const backToBtc = inUsd.convert('BTC', RATES);
      expect(backToBtc.value).toBeCloseTo(0.5);
      expect(backToBtc.currency).toBe('BTC');
    });
  });
});
