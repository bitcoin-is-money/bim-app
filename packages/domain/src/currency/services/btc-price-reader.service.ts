import {serializeError} from '@bim/lib/error';
import type {Logger} from 'pino';
import type {PriceGateway} from '../../ports';
import {FiatCurrency} from '../fiat-currency';
import type {
  GetPricesInput,
  GetPricesUseCase,
} from '../use-cases/get-prices.use-case';

export interface BtcPriceReaderDeps {
  priceGateway: PriceGateway;
  logger: Logger;
}

/**
 * Retrieves BTC prices for the requested fiat currencies.
 *
 * Cache strategy: a single fetch pulls prices for ALL supported currencies
 * and caches them in memory for CACHE_TTL_MS. Callers receive only the
 * subset they requested.
 *
 * If the upstream gateway fails but a stale cache is available, the stale
 * cache is returned (graceful degradation). Throws only when no cache exists.
 */
export class BtcPriceReader implements GetPricesUseCase {

  public static readonly CACHE_TTL_MS = 2 * 3600 * 1000; // 2 hours

  private readonly log: Logger;
  private readonly allCurrencies: FiatCurrency[];
  private cachedPrices = new Map<FiatCurrency, number>();
  private cachedAt = 0;

  constructor(private readonly deps: BtcPriceReaderDeps) {
    this.log = deps.logger.child({name: 'btc-price-reader.service.ts'});
    this.allCurrencies = FiatCurrency.getSupportedCurrencies()
      .map(c => FiatCurrency.of(c));
  }

  async getPrices({currencies}: GetPricesInput): Promise<Map<FiatCurrency, number>> {
    const shouldRefreshCache: boolean = this.cachedPrices.size === 0
      || Date.now() - this.cachedAt >= BtcPriceReader.CACHE_TTL_MS;

    if (shouldRefreshCache) {
      try {
        await this.refreshCache();
      } catch (error) {
        this.log.warn(
          {error: serializeError(error)},
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
    const logMsg = 'Fetched BTC prices for all available currencies';
    if (this.log.isLevelEnabled('debug')) {
      this.log.info({prices: Object.fromEntries(prices)}, logMsg);
    } else {
      this.log.info(logMsg);
    }
  }
}
