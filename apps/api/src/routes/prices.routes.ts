import {Hono} from 'hono';

export function createPricesRoutes(): Hono {
  const app = new Hono();

  app.get('/', async (ctx) => {
    // TODO: Implement real price fetching from external API
    // For now, return mocked data
    return ctx.json({
      BTC_USD: 97000,
    });
  });

  return app;
}
