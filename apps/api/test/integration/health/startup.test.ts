import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {AppInstance} from '../../../src/app';
import {TestApp} from '../helpers';

/**
 * Integration coverage for the startup health check wiring:
 *  - All six tracked components are registered in the registry
 *  - `GET /api/health` surfaces the registry snapshot faithfully
 *  - Runtime `reportDown` transitions propagate to the `/api/health` response
 *
 * Startup is booted with `skipStartupHealthChecks: true` to avoid flakiness
 * from external network calls. The orchestrator logic itself is covered by
 * the per-gateway unit tests under `apps/api/test/unit/adapters/gateways/`.
 */
describe('Startup health integration', () => {
  let appInstance: AppInstance;

  beforeAll(async () => {
    appInstance = await TestApp.createTestAppWithLogger({});
  });

  afterAll(() => {
    appInstance.swapMonitor?.stop();
  });

  it('registers all six tracked components in the health registry', () => {
    const snapshot = appInstance.context.healthRegistry.getState();
    const names = snapshot.components.map(c => c.name).sort();
    expect(names).toEqual([
      'atomiq',
      'avnu-paymaster',
      'avnu-swap',
      'coingecko-price',
      'database',
      'starknet-rpc',
    ]);
  });

  it('starts every component in healthy state', () => {
    const snapshot = appInstance.context.healthRegistry.getState();
    for (const comp of snapshot.components) {
      expect(comp.status).toBe('healthy');
    }
    expect(snapshot.overall).toBe('healthy');
  });

  it('exposes the full service list through GET /api/health', async () => {
    const res = await TestApp.request(appInstance.app).get('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json() as {
      status: string;
      checks: {database: string};
      services: {name: string; status: string}[];
    };
    expect(body.checks.database).toBe('ok');
    const names = body.services.map(s => s.name).sort();
    expect(names).toEqual([
      'atomiq',
      'avnu-paymaster',
      'avnu-swap',
      'coingecko-price',
      'database',
      'starknet-rpc',
    ]);
  });

  it('propagates runtime reportDown transitions to GET /api/health', async () => {
    appInstance.context.healthRegistry.reportDown('starknet-rpc', {
      kind: 'network',
      summary: 'simulated starknet outage',
    });

    const res = await TestApp.request(appInstance.app).get('/api/health');
    // DB is still healthy, so the HTTP status stays 200 and the top-level
    // `status` field (derived from DB only) also stays 'healthy'. The
    // per-service entry in `services` reflects the actual down state.
    expect(res.status).toBe(200);
    const body = await res.json() as {
      services: {name: string; status: string; lastError?: {kind: string; summary: string}}[];
    };
    const starknetEntry = body.services.find(s => s.name === 'starknet-rpc');
    expect(starknetEntry?.status).toBe('down');
    expect(starknetEntry?.lastError?.kind).toBe('network');

    // The registry snapshot's overall status reflects the degraded state
    // even though the HTTP `status` field does not.
    expect(appInstance.context.healthRegistry.getState().overall).toBe('degraded');

    // Restore for hygiene in case other tests share the instance.
    appInstance.context.healthRegistry.reportHealthy('starknet-rpc');
  });
});
