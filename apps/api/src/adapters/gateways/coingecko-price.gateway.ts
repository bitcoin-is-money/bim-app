import {ExternalServiceError} from '@bim/domain/shared';
import type {FiatCurrency} from '@bim/domain/currency';
import type {PriceGateway} from '@bim/domain/ports';
import type {Logger} from 'pino';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';

export class CoinGeckoPriceGateway implements PriceGateway {
  private readonly log: Logger;

  constructor(rootLogger: Logger) {
    this.log = rootLogger.child({name: 'coingecko-price.gateway.ts'});
  }

  async getBtcPrices(currencies: FiatCurrency[]): Promise<Map<FiatCurrency, number>> {
    try {
      const vsCurrencies = currencies.map(c => (c as string).toLowerCase()).join(',');
      const url = `${COINGECKO_BASE_URL}?ids=bitcoin&vs_currencies=${vsCurrencies}`;

      this.log.debug({currencies: currencies.map(c => c as string)}, 'Fetching BTC prices from CoinGecko');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { bitcoin?: Record<string, number> };
      const bitcoin = data.bitcoin;
      if (!bitcoin || typeof bitcoin !== 'object') {
        throw new Error(`Unexpected response format: ${JSON.stringify(data)}`);
      }

      const result = new Map<FiatCurrency, number>();
      for (const currency of currencies) {
        const key = (currency as string).toLowerCase();
        const price = bitcoin[key];
        if (typeof price !== 'number' || price <= 0) {
          throw new Error(`Invalid price for ${currency}: ${price}`);
        }
        result.set(currency, price);
      }
      return result;
    } catch (error) {
      throw new ExternalServiceError(
        'CoinGecko',
        `Failed to fetch BTC prices: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
