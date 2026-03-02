import {UnsupportedCurrencyError} from './errors';

/**
 * Fiat currency code (ISO 4217).
 */
export type FiatCurrency = string & {readonly __brand: 'FiatCurrency'};

export namespace FiatCurrency {
  const SUPPORTED_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']);

  export const DEFAULT: FiatCurrency = 'USD' as FiatCurrency;

  export function of(value: string): FiatCurrency {
    const normalized = value.trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(normalized)) {
      throw new UnsupportedCurrencyError(value, [...SUPPORTED_CURRENCIES]);
    }
    return normalized as FiatCurrency;
  }

  export function ofAll(values: string[]): [FiatCurrency, ...FiatCurrency[]] {
    if (values.length === 0) {
      throw new UnsupportedCurrencyError('(empty list)', [...SUPPORTED_CURRENCIES]);
    }
    return values.map(of) as [FiatCurrency, ...FiatCurrency[]];
  }

  export function isSupported(value: string): boolean {
    return SUPPORTED_CURRENCIES.has(value.trim().toUpperCase());
  }

  export function getSupportedCurrencies(): readonly string[] {
    return [...SUPPORTED_CURRENCIES].sort();
  }
}
