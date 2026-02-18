import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import {DatabaseConnection} from '@bim/db/connection';
import type {HealthCheckResponse, LiveResponse, ReadyResponse} from './health.types';

export function createHealthRoutes(): Hono {
  const app = new Hono();

  app.get('/', async (honoCtx): Promise<TypedResponse<HealthCheckResponse>> => {
    const dbOk = await DatabaseConnection.get().testConnection();

    const status = dbOk ? 'healthy' : 'degraded';
    const statusCode = dbOk ? 200 : 503;

    return honoCtx.json<HealthCheckResponse>(
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

  app.get('/ready', async (honoCtx): Promise<TypedResponse<ReadyResponse>> => {
    const dbOk = await DatabaseConnection.get().testConnection();

    if (!dbOk) {
      return honoCtx.json<ReadyResponse>({ ready: false }, 503);
    }

    return honoCtx.json<ReadyResponse>({ ready: true });
  });

  app.get('/live', (honoCtx): TypedResponse<LiveResponse> => {
    return honoCtx.json<LiveResponse>({ live: true });
  });

  return app;
}
