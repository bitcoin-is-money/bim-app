import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import type {GetPricesResponse} from './currency.types';

export function createCurrencyRoutes(): Hono {
  const app = new Hono();

  app.get('/prices', (honoCtx): TypedResponse<GetPricesResponse> => {
    // TODO: Implement real price fetching from external API
    // For now, return mocked data
    return honoCtx.json<GetPricesResponse>({
      BTC_USD: 97000,
    });
  });

  return app;
}
