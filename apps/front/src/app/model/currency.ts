
export type Currency = 'USD' | 'SAT' | 'BTC';

export interface ConversionRates {
  BTC_USD: number;
}

export namespace Currency {
  export const SATS_PER_BTC = 100_000_000;

  /** Returns the number of decimal places for display based on currency */
  export function decimals(currency: Currency): number {
    switch (currency) {
      case 'BTC': return 8;
      case 'USD': return 2;
      case 'SAT': return 0;
    }
  }

  /** Returns the symbol for a currency */
  export function symbol(currency: Currency): string {
    switch (currency) {
      case 'BTC': return '₿';
      case 'USD': return '$';
      case 'SAT': return 'sat';
    }
  }
}
