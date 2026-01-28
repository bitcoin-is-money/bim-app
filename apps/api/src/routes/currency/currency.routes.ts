import {Hono} from 'hono';

export function createCurrencyRoutes(): Hono {
  const app = new Hono();

  app.get('/prices', async (honoCtx) => {
    // TODO: Implement real price fetching from external API
    // For now, return mocked data
    return honoCtx.json({
      BTC_USD: 97000,
    });
  });

  return app;
}
