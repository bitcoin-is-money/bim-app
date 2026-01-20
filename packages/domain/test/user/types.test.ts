import {
  FiatCurrency,
  InvalidTransactionHashError,
  InvalidTransactionIdError,
  InvalidUserAddressIdError,
  InvalidUserSettingsIdError,
  TransactionHash,
  TransactionId,
  UnsupportedCurrencyError,
  UserAddressId,
  UserSettingsId,
} from '@bim/domain/user';
import {describe, expect, it} from 'vitest';

describe('UserSettingsId', () => {
  describe('of', () => {
    it('creates UserSettingsId from valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = UserSettingsId.of(uuid);
      expect(id).toBe(uuid);
    });

    it('throws InvalidUserSettingsIdError for invalid UUID', () => {
      expect(() => UserSettingsId.of('not-a-uuid')).toThrow(InvalidUserSettingsIdError);
    });
  });

  describe('generate', () => {
    it('generates valid UUID', () => {
      const id = UserSettingsId.generate();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});

describe('UserAddressId', () => {
  describe('of', () => {
    it('creates UserAddressId from valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = UserAddressId.of(uuid);
      expect(id).toBe(uuid);
    });

    it('throws InvalidUserAddressIdError for invalid UUID', () => {
      expect(() => UserAddressId.of('invalid')).toThrow(InvalidUserAddressIdError);
    });
  });

  describe('generate', () => {
    it('generates valid UUID', () => {
      const id = UserAddressId.generate();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});

describe('TransactionId', () => {
  describe('of', () => {
    it('creates TransactionId from valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = TransactionId.of(uuid);
      expect(id).toBe(uuid);
    });

    it('throws InvalidTransactionIdError for invalid UUID', () => {
      expect(() => TransactionId.of('invalid')).toThrow(InvalidTransactionIdError);
    });
  });

  describe('generate', () => {
    it('generates valid UUID', () => {
      const id = TransactionId.generate();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});

describe('TransactionHash', () => {
  describe('of', () => {
    it('creates TransactionHash from valid hex', () => {
      const hash = TransactionHash.of('0x123abc');
      expect(hash).toBe('0x0000000000000000000000000000000000000000000000000000000000123abc');
    });

    it('normalizes to lowercase', () => {
      const hash = TransactionHash.of('0x123ABC');
      expect(hash).toBe('0x0000000000000000000000000000000000000000000000000000000000123abc');
    });

    it('pads short hashes to 66 characters', () => {
      const hash = TransactionHash.of('0x1');
      expect(hash.length).toBe(66);
      expect(hash.startsWith('0x')).toBe(true);
    });

    it('throws InvalidTransactionHashError for invalid hash', () => {
      expect(() => TransactionHash.of('not-a-hash')).toThrow(InvalidTransactionHashError);
      expect(() => TransactionHash.of('123')).toThrow(InvalidTransactionHashError);
      expect(() => TransactionHash.of('0xGGG')).toThrow(InvalidTransactionHashError);
    });
  });

  describe('isValid', () => {
    it('returns true for valid hashes', () => {
      expect(TransactionHash.isValid('0x123')).toBe(true);
      expect(TransactionHash.isValid('0xabcdef')).toBe(true);
    });

    it('returns false for invalid hashes', () => {
      expect(TransactionHash.isValid('123')).toBe(false);
      expect(TransactionHash.isValid('0xGGG')).toBe(false);
    });
  });
});

describe('FiatCurrency', () => {
  describe('of', () => {
    it('creates FiatCurrency from valid code', () => {
      const currency = FiatCurrency.of('USD');
      expect(currency).toBe('USD');
    });

    it('normalizes to uppercase', () => {
      const currency = FiatCurrency.of('usd');
      expect(currency).toBe('USD');
    });

    it('trims whitespace', () => {
      const currency = FiatCurrency.of('  EUR  ');
      expect(currency).toBe('EUR');
    });

    it('accepts all supported currencies', () => {
      const supported = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
      for (const code of supported) {
        expect(() => FiatCurrency.of(code)).not.toThrow();
      }
    });

    it('throws UnsupportedCurrencyError for unsupported currency', () => {
      expect(() => FiatCurrency.of('BTC')).toThrow(UnsupportedCurrencyError);
      expect(() => FiatCurrency.of('XYZ')).toThrow(UnsupportedCurrencyError);
    });
  });

  describe('isSupported', () => {
    it('returns true for supported currencies', () => {
      expect(FiatCurrency.isSupported('USD')).toBe(true);
      expect(FiatCurrency.isSupported('eur')).toBe(true);
    });

    it('returns false for unsupported currencies', () => {
      expect(FiatCurrency.isSupported('BTC')).toBe(false);
    });
  });

  describe('getSupportedCurrencies', () => {
    it('returns list of supported currencies', () => {
      const currencies = FiatCurrency.getSupportedCurrencies();
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT', () => {
    it('is USD', () => {
      expect(FiatCurrency.DEFAULT).toBe('USD');
    });
  });
});
