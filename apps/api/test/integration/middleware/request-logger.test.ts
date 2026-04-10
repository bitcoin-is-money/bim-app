import {beforeAll, describe, expect, it} from 'vitest';
import type {AppInstance} from '../../../src/app';
import {TestApp} from '../helpers';

describe('Request logger middleware (integration)', () => {
  let instance: AppInstance;

  beforeAll(async () => {
    instance = await TestApp.createTestAppWithLogger();
  });

  it('logs requests with requestId visible in output', async () => {
    // logLevel is 'info' → pino-pretty output will appear in the vitest console
    const res = await TestApp
      .request(instance.app)
      .get('/api/health/live');

    expect(res.status).toBe(200);

    // The middleware sets the X-Request-Id header, proving it ran
    const requestId = res.headers.get('X-Request-Id');
    expect(requestId).toBeTruthy();
    expect(Number(requestId)).toBeGreaterThan(0);
    expect(Number(requestId)).toBeLessThanOrEqual(999);
  });
});
