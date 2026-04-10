
export type CryptoCurrency = 'BTC' | 'SAT';
export type FiatCurrency = string;
export type Currency = CryptoCurrency | (string & {});

export interface ConversionRates {
  prices: Record<string, number>;
}

export namespace Currency {

  const intlCache = new Map<string, { decimals: number; symbol: string }>();

  function getIntlData(code: string): { decimals: number; symbol: string } {
    const cached = intlCache.get(code);
    if (cached) {
      return cached;
    }
    const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: code });
    const decimals = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    const symbol = fmt.formatToParts(0)
      .find(p => p.type === 'currency')?.value ?? code;
    const entry = { decimals, symbol };
    intlCache.set(code, entry);
    return entry;
  }

  /** Returns the number of decimal places for display based on currency */
  export function decimals(currency: Currency): number {
    switch (currency) {
      case 'BTC': return 8;
      case 'SAT': return 0;
      default: return getIntlData(currency).decimals;
    }
  }

  /** Returns the symbol for a currency */
  export function symbol(currency: Currency): string {
    switch (currency) {
      case 'BTC': return '₿';
      case 'SAT': return 'sat';
      default: return getIntlData(currency).symbol;
    }
  }

  export function isCrypto(currency: Currency): currency is CryptoCurrency {
    return currency === 'BTC' || currency === 'SAT';
  }
}
