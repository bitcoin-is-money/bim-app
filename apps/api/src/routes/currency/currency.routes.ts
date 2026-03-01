import {Account} from '@bim/domain/account';
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

  app.get('/prices', async (honoCtx): Promise<TypedResponse<GetPricesResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      // Fetch user's preferred currencies
      const {settings} = await appCtx.services.userSettings
        .fetch({accountId: account.id});
      const preferredCurrencies = settings.getPreferredCurrencies();

      // Fetch BTC prices for preferred currencies
      const priceMap = await appCtx.services.currency
        .getBtcPrices(preferredCurrencies);

      // Convert Map to a plain object
      const prices: Record<string, number> = {};
      for (const [currency, price] of priceMap) {
        prices[currency] = price;
      }

      return honoCtx.json<GetPricesResponse>({
        prices,
        supportedCurrencies: FiatCurrency.getSupportedCurrencies(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
