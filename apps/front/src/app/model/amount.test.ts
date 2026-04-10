import {describe, expect, it} from 'vitest';
import {Amount} from './amount';
import type {ConversionRates} from './currency';
import {Currency} from './currency';

const RATES: ConversionRates = {prices: {USD: 100_000}};

describe('Currency', () => {
  describe('decimals', () => {
    it('should return 8 for BTC', () => { expect(Currency.decimals('BTC')).toBe(8); });
    it('should return 0 for SAT', () => { expect(Currency.decimals('SAT')).toBe(0); });
    it('should return 2 for USD via Intl', () => { expect(Currency.decimals('USD')).toBe(2); });
    it('should return 2 for EUR via Intl', () => { expect(Currency.decimals('EUR')).toBe(2); });
    it('should return 0 for JPY via Intl', () => { expect(Currency.decimals('JPY')).toBe(0); });
  });

  describe('symbol', () => {
    it('should return ₿ for BTC', () => { expect(Currency.symbol('BTC')).toBe('₿'); });
    it('should return sat for SAT', () => { expect(Currency.symbol('SAT')).toBe('sat'); });
    it('should return $ for USD via Intl', () => { expect(Currency.symbol('USD')).toBe('$'); });
    it('should return € for EUR via Intl', () => { expect(Currency.symbol('EUR')).toBe('€'); });
    it('should return ¥ for JPY via Intl', () => { expect(Currency.symbol('JPY')).toBe('¥'); });
    it('should return CHF for CHF via Intl', () => { expect(Currency.symbol('CHF')).toBe('CHF'); });
  });
});

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

  describe('format', () => {
    it('should format with en-US locale by default', () => {
      const amount = Amount.of(1234.56, 'USD');
      expect(amount.format()).toBe('1,234.56');
    });

    it('should format with fr-FR locale', () => {
      const amount = Amount.of(1234.56, 'USD');
      // French uses narrow no-break space as group separator and comma as decimal
      const formatted = amount.format('fr-FR');
      expect(formatted).toContain('1');
      expect(formatted).toContain('234');
      expect(formatted).toContain(',');
      expect(formatted).toContain('56');
    });

    it('should format SAT with no decimals', () => {
      const amount = Amount.of(100000, 'SAT');
      expect(amount.format()).toBe('100,000');
      const formatted = amount.format('fr-FR');
      expect(formatted).toContain('100');
      expect(formatted).toContain('000');
    });

    it('should format BTC with 8 decimal places', () => {
      const amount = Amount.of(1.5, 'BTC');
      expect(amount.format()).toBe('1.50000000');
      expect(amount.format('fr-FR')).toContain('1,50000000');
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

    it('should keep value unchanged when rate is missing', () => {
      const amount = Amount.of(500, 'USD');
      const result = amount.convert('SAT', {prices: {}});
      expect(result.value).toBe(500);
      expect(result.currency).toBe('SAT');
    });

    // SAT → USD
    it('should convert SAT to USD', () => {
      const amount = Amount.of(100_000_000, 'SAT'); // 1 BTC in sats
      const result = amount.convert('USD', RATES);
      expect(result.value).toBe(100_000);
      expect(result.currency).toBe('USD');
    });

    // USD → SAT
    it('should convert USD to SAT', () => {
      const amount = Amount.of(100_000, 'USD'); // 1 BTC worth
      const result = amount.convert('SAT', RATES);
      expect(result.value).toBe(100_000_000);
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
      expect(result.value).toBe(100_000_000);
      expect(result.currency).toBe('SAT');
    });

    // SAT → BTC
    it('should convert SAT to BTC', () => {
      const amount = Amount.of(100_000_000, 'SAT');
      const result = amount.convert('BTC', RATES);
      expect(result.value).toBe(1);
      expect(result.currency).toBe('BTC');
    });

    // Multi-currency: EUR conversion
    it('should convert BTC to EUR', () => {
      const ratesWithEur: ConversionRates = {prices: {USD: 100_000, EUR: 90_000}};
      const amount = Amount.of(1, 'BTC');
      const result = amount.convert('EUR', ratesWithEur);
      expect(result.value).toBe(90_000);
      expect(result.currency).toBe('EUR');
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
