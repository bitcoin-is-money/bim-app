import {Hono} from 'hono';
import {testConnection} from '../db';

export function createHealthRoutes(): Hono {
  const app = new Hono();

  app.get('/', async (ctx) => {
    const dbOk = await testConnection();

    const status = dbOk ? 'healthy' : 'degraded';
    const statusCode = dbOk ? 200 : 503;

    return ctx.json(
      {
        status,
        timestamp: new Date().toISOString(),
        checks: {
          database: dbOk ? 'ok' : 'error',
        },
      },
      statusCode,
    );
  });

  app.get('/ready', async (ctx) => {
    const dbOk = await testConnection();

    if (!dbOk) {
      return ctx.json({ ready: false }, 503);
    }

    return ctx.json({ ready: true });
  });

  app.get('/live', (ctx) => {
    return ctx.json({ live: true });
  });

  return app;
}
