import {Database} from '@bim/db/database';
import type {ComponentHealth, HealthRegistry} from '@bim/domain/health';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import type {AppContext} from '../../app-context';
import type {HealthCheckResponse, LiveResponse, ReadyResponse, ServiceHealthEntry} from './health.types';

const DB_ERROR_SUMMARY = 'Database connection test failed';

export function createHealthRoutes(context: Pick<AppContext, 'healthRegistry'>): Hono {
  const app = new Hono();
  const registry = context.healthRegistry;

  app.get('/', async (honoCtx): Promise<TypedResponse<HealthCheckResponse>> => {
    const dbOk = await pingDatabase(registry);

    const snapshot = registry.getState();
    const services: ServiceHealthEntry[] = snapshot.components.map(toEntry);

    // DB health is the only hard failure condition for the endpoint's HTTP
    // status: a degraded external service (atomiq, paymaster, …) still lets
    // the app run, so we return 200 and surface the issue in the payload.
    const status: HealthCheckResponse['status'] = dbOk ? 'healthy' : 'degraded';
    const statusCode = dbOk ? 200 : 503;

    const body: HealthCheckResponse = {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'error',
      },
      services,
    };
    return honoCtx.json(body, statusCode) as TypedResponse<HealthCheckResponse>;
  });

  app.get('/ready', async (honoCtx): Promise<TypedResponse<ReadyResponse>> => {
    const dbOk = await pingDatabase(registry);
    if (!dbOk) {
      return honoCtx.json<ReadyResponse>({ready: false}, 503);
    }
    return honoCtx.json<ReadyResponse>({ready: true});
  });

  app.get('/live', (honoCtx): TypedResponse<LiveResponse> => {
    return honoCtx.json<LiveResponse>({live: true});
  });

  return app;
}

async function pingDatabase(registry: HealthRegistry): Promise<boolean> {
  try {
    const ok = await Database.get().testConnection();
    if (ok) {
      registry.reportHealthy('database');
    } else {
      registry.reportDown('database', {kind: 'unknown', summary: DB_ERROR_SUMMARY});
    }
    return ok;
  } catch (err: unknown) {
    registry.reportDown('database', {
      kind: 'unknown',
      summary: err instanceof Error ? err.message : DB_ERROR_SUMMARY,
    });
    return false;
  }
}

function toEntry(comp: ComponentHealth): ServiceHealthEntry {
  const downSince = comp.downSince?.toISOString();
  const lastError = toLastError(comp.lastError);
  return {
    name: comp.name,
    status: comp.status,
    ...(downSince !== undefined && {downSince}),
    ...(lastError !== undefined && {lastError}),
  };
}

function toLastError(err: ComponentHealth['lastError']): NonNullable<ServiceHealthEntry['lastError']> | undefined {
  if (err === undefined) return undefined;
  const httpCode = err.httpCode;
  return {
    kind: err.kind,
    summary: err.summary,
    ...(httpCode !== undefined && {httpCode}),
  };
}
