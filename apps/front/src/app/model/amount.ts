import {ConversionRates, Currency} from './currency';

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

  clone(): Amount {
    return Amount.of(this.value, this.currency);
  }

  convert(
    targetCurrency: Currency,
    rates: ConversionRates
  ): Amount {
    if (this.currency === targetCurrency) {
      return this.clone();
    }

    const btcUsd = rates.BTC_USD;

    if (btcUsd === 0) {
      return new Amount(this.value, targetCurrency);
    }

    // Convert to BTC first (base unit)
    let amountInBtc: number;
    switch (this.currency) {
      case 'BTC':
        amountInBtc = this.value;
        break;
      case 'SAT':
        amountInBtc = this.value / Currency.SATS_PER_BTC;
        break;
      case 'USD':
        amountInBtc = this.value / btcUsd;
        break;
    }

    // Convert from BTC to target currency
    let convertedValue: number;
    switch (targetCurrency) {
      case 'BTC':
        convertedValue = amountInBtc;
        break;
      case 'SAT':
        convertedValue = amountInBtc * Currency.SATS_PER_BTC;
        break;
      case 'USD':
        convertedValue = amountInBtc * btcUsd;
        break;
    }

    return new Amount(convertedValue, targetCurrency);
  }

}
