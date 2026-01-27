
export type Currency = 'USD' | 'SAT' | 'BTC';

export interface ConversionRates {
  BTC_USD: number;
}

export namespace Currency {
  export const SATS_PER_BTC = 100_000_000;
}
