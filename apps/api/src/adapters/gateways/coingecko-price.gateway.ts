import {ExternalServiceError, SanitizedError} from '@bim/domain/shared';
import type {FiatCurrency} from '@bim/domain/currency';
import type {HealthRegistry} from '@bim/domain/health';
import type {PriceGateway} from '@bim/domain/ports';
import type {Logger} from 'pino';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const COINGECKO_PING_URL = 'https://api.coingecko.com/api/v3/ping';
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

export class CoinGeckoPriceGateway implements PriceGateway {
  private readonly log: Logger;

  constructor(
    rootLogger: Logger,
    private readonly healthRegistry: HealthRegistry,
  ) {
    this.log = rootLogger.child({name: 'coingecko-price.gateway.ts'});
  }

  /**
   * Pings the CoinGecko /ping endpoint.
   * Any 2xx response means the service is reachable and responsive.
   */
  async checkHealth(): Promise<void> {
    try {
      const response = await fetch(COINGECKO_PING_URL, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });
      if (!response.ok) {
        const sanitized: SanitizedError = {
          kind: 'html_response',
          httpCode: response.status,
          summary: `CoinGecko /ping returned HTTP ${response.status}`,
        };
        this.log.error({coingeckoError: sanitized}, 'CoinGecko health check failed');
        this.healthRegistry.reportDown('coingecko-price', sanitized);
        return;
      }
      this.healthRegistry.reportHealthy('coingecko-price');
    } catch (err: unknown) {
      const sanitized = SanitizedError.sanitize('CoinGecko', err);
      this.log.error({coingeckoError: sanitized}, 'CoinGecko health check failed');
      this.healthRegistry.reportDown('coingecko-price', sanitized);
    }
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
        // eslint-disable-next-line security/detect-object-injection -- key derived from FiatCurrency enum, not user input
        const price = bitcoin[key];
        if (price === undefined || price <= 0) {
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
