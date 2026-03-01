import type {FiatCurrency} from '../currency';

export interface PriceGateway {
  /** Fetches BTC price in the given fiat currencies. Returns a map of currency → price. */
  getBtcPrices(currencies: FiatCurrency[]): Promise<Map<FiatCurrency, number>>;
}
