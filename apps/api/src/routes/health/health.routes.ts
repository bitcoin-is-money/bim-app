import {Hono} from 'hono';
import {testConnection} from '../../db';

export function createHealthRoutes(): Hono {
  const app = new Hono();

  app.get('/', async (honoCtx) => {
    const dbOk = await testConnection();

    const status = dbOk ? 'healthy' : 'degraded';
    const statusCode = dbOk ? 200 : 503;

    return honoCtx.json(
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

  app.get('/ready', async (honoCtx) => {
    const dbOk = await testConnection();

    if (!dbOk) {
      return honoCtx.json({ ready: false }, 503);
    }

    return honoCtx.json({ ready: true });
  });

  app.get('/live', (honoCtx) => {
    return honoCtx.json({ live: true });
  });

  return app;
}
