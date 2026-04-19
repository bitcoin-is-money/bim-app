import type {FiatCurrency} from '../fiat-currency';

/**
 * Retrieves BTC prices for the requested fiat currencies.
 */
export interface GetPricesUseCase {
  getBtcPrices(currencies: FiatCurrency[]): Promise<Map<FiatCurrency, number>>;
}
