import type {ConversionRates} from './currency';
import {Currency} from './currency';

const SATS_PER_BTC = 100_000_000;

export class Amount {

  private constructor(
    public readonly value: number,
    public readonly currency: Currency
  ) {}

  static zero(currency: Currency = 'USD'): Amount {
    return new Amount(0, currency);
  }

  static of(
    value: number,
    currency: Currency
  ): Amount {
    return new Amount(value, currency);
  }

  static satToBtc(sats: number): number {
    return sats / SATS_PER_BTC;
  }

  clone(): Amount {
    return Amount.of(this.value, this.currency);
  }

  /** Returns the formatted value as a string with appropriate decimal places */
  format(locale = 'en-US'): string {
    const decimals = Currency.decimals(this.currency);
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(this.value);
  }

  isPositive(): boolean {
    return this.value > 0;
  }

  convert(
    targetCurrency: Currency,
    rates: ConversionRates
  ): Amount {
    if (this.currency === targetCurrency) {
      return this.clone();
    }

    // Convert source to BTC first (base unit)
    const amountInBtc = this.toBtc(rates);

    // If conversion failed (no rate), keep original value
    if (amountInBtc === undefined) {
      return new Amount(this.value, targetCurrency);
    }

    // Convert from BTC to target currency
    const convertedValue = Amount.fromBtc(amountInBtc, targetCurrency, rates);
    if (convertedValue === undefined) {
      return new Amount(this.value, targetCurrency);
    }

    return new Amount(convertedValue, targetCurrency);
  }

  private toBtc(rates: ConversionRates): number | undefined {
    switch (this.currency) {
      case 'BTC':
        return this.value;
      case 'SAT':
        return this.value / SATS_PER_BTC;
      default: {
        const rate = rates.prices[this.currency];
        if (!rate || rate === 0) {
          return undefined;
        }
        return this.value / rate;
      }
    }
  }

  private static fromBtc(
    btcAmount: number,
    target: Currency,
    rates: ConversionRates
  ): number | undefined {
    switch (target) {
      case 'BTC':
        return btcAmount;
      case 'SAT':
        return btcAmount * SATS_PER_BTC;
      default: {
        // eslint-disable-next-line security/detect-object-injection -- key is a fiat currency code (string)
        const rate = rates.prices[target];
        if (!rate || rate === 0) {
          return undefined;
        }
        return btcAmount * rate;
      }
    }
  }

}
