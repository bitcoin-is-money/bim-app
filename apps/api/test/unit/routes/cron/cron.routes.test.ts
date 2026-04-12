import {createLogger} from '@bim/lib/logger';
import {Hono} from 'hono';
import {describe, expect, it, vi} from 'vitest';
import type {ActivityMonitoring} from '../../../../src/monitoring/activity.monitoring';
import type {BalanceMonitoring} from '../../../../src/monitoring/balance.monitoring';
import {createCronRoutes, type CronRoutesDeps} from '../../../../src/routes/cron/cron.routes';

const CRON_SECRET = 'test-cron-secret';

function createMockBalanceMonitoring(): BalanceMonitoring {
  return {run: vi.fn().mockResolvedValue(undefined)} as unknown as BalanceMonitoring;
}

function createMockActivityMonitoring(): ActivityMonitoring {
  return {run: vi.fn().mockResolvedValue(undefined)} as unknown as ActivityMonitoring;
}

function createTestDeps(overrides: Partial<CronRoutesDeps> = {}): CronRoutesDeps {
  return {
    cronSecret: CRON_SECRET,
    balanceMonitoring: createMockBalanceMonitoring(),
    activityMonitoring: createMockActivityMonitoring(),
    logger: createLogger(),
    ...overrides,
  };
}

function createTestApp(deps?: Partial<CronRoutesDeps>): Hono {
  const app = new Hono();
  createCronRoutes(app, createTestDeps(deps));
  return app;
}

describe('cron routes', () => {
  it('returns 401 when secret is invalid', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({secret: 'wrong-secret', type: 'balance-check'}),
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid balance-check request', async () => {
    const balanceMonitoring = createMockBalanceMonitoring();
    const app = createTestApp({balanceMonitoring});
    const res = await app.request('/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({secret: CRON_SECRET, type: 'balance-check'}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ok: true});
    expect(balanceMonitoring.run).toHaveBeenCalledOnce();
  });

  it('returns 200 for valid activity-reporting request', async () => {
    const activityMonitoring = createMockActivityMonitoring();
    const app = createTestApp({activityMonitoring});
    const res = await app.request('/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({secret: CRON_SECRET, type: 'activity-reporting'}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ok: true});
    expect(activityMonitoring.run).toHaveBeenCalledOnce();
  });

  it('returns 400 for unknown cron type', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({secret: CRON_SECRET, type: 'unknown'}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 when body is not JSON', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: 'not json',
    });
    expect(res.status).toBe(500);
  });
});
