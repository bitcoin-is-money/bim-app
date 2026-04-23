import type {FiatCurrency} from '../fiat-currency';

export interface GetPricesInput {
  currencies: FiatCurrency[];
}

/**
 * Retrieves BTC prices for the requested fiat currencies.
 */
export interface GetPricesUseCase {
  getPrices(input: GetPricesInput): Promise<Map<FiatCurrency, number>>;
}
