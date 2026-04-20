import {FiatCurrency} from '@bim/domain/currency';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import type {AppContext} from '../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../errors';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types';
import type {GetPricesResponse} from './currency.types';

export function createCurrencyRoutes(appCtx: AppContext): AuthenticatedHono {
  const log = appCtx.logger.child({name: 'currency.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appCtx));

  /**
   * GET /api/currency/prices
   *
   * Returns BTC prices for all supported fiat currencies.
   * The response is a flat object: keys = currency codes, values = BTC price.
   * The set of keys also serves as the list of supported currencies.
   *
   * Example: { "AUD": 148000, "CAD": 132000, "EUR": 89000, "USD": 97000, ... }
   */
  app.get('/prices', async (honoCtx): Promise<TypedResponse<GetPricesResponse | ApiErrorResponse>> => {
    try {
      const allCurrencies = FiatCurrency.getSupportedCurrencies()
        .map(c => FiatCurrency.of(c));

      const priceMap = await appCtx.useCases.getPrices
        .getBtcPrices(allCurrencies);

      const prices: GetPricesResponse = {};
      for (const [currency, price] of priceMap) {
        // eslint-disable-next-line security/detect-object-injection -- key from Map iteration
        prices[currency] = price;
      }

      return honoCtx.json(prices);
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
