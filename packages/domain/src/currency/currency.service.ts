import type {Logger} from 'pino';
import type {PriceGateway} from '../ports';
import {FiatCurrency} from './fiat-currency';

// =============================================================================
// Dependencies
// =============================================================================

export interface CurrencyServiceDeps {
  priceGateway: PriceGateway;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

export class CurrencyService {

  public static readonly CACHE_TTL_MS = 2 * 3600 * 1000; // 2 hours

  private readonly log: Logger;
  private readonly allCurrencies: FiatCurrency[];
  private cachedPrices = new Map<FiatCurrency, number>();
  private cachedAt = 0;

  constructor(private readonly deps: CurrencyServiceDeps) {
    this.log = deps.logger.child({name: 'currency.service.ts'});
    this.allCurrencies = FiatCurrency.getSupportedCurrencies()
      .map(c => FiatCurrency.of(c));
  }

  /**
   * Returns BTC prices for the requested fiat currencies.
   * The cache always holds ALL available currencies (single fetch).
   * Returns only the requested subset.
   */
  async getBtcPrices(currencies: FiatCurrency[]): Promise<Map<FiatCurrency, number>> {
    const shouldRefreshCache: boolean = this.cachedPrices.size === 0
      || Date.now() - this.cachedAt >= CurrencyService.CACHE_TTL_MS;

    if (shouldRefreshCache) {
      try {
        await this.refreshCache();
      } catch (error) {
        this.log.warn(
          {error: error instanceof Error ? error.message : String(error)},
          'Failed to refresh BTC prices',
        );
      }
    }
    if (this.cachedPrices.size === 0) {
      throw new Error('No cached BTC prices available');
    }
    return this.getPricesFromCache(currencies);
  }

  private getPricesFromCache(currencies: FiatCurrency[]): Map<FiatCurrency, number> {
    const result = new Map<FiatCurrency, number>();
    for (const currency of currencies) {
      const price = this.cachedPrices.get(currency);
      if (price !== undefined) {
        result.set(currency, price);
      }
    }
    return result;
  }

  private async refreshCache(): Promise<void> {
    const prices = await this.deps.priceGateway
      .getBtcPrices(this.allCurrencies);
    this.cachedPrices = prices;
    this.cachedAt = Date.now();
    this.log.info({prices: Object.fromEntries(prices)},
      'Fetched BTC prices for all available currencies');
  }

}
