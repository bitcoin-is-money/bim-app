import {Hono} from 'hono';
import {beforeEach, describe, expect, it} from 'vitest';

import {
  createAuthRateLimit,
  createGlobalRateLimit,
  createPaymentExecuteRateLimit,
} from '../../../src/middleware/rate-limit.middleware';

function createTestApp(middleware: ReturnType<typeof createGlobalRateLimit>) {
  const app = new Hono();
  app.use('*', middleware);
  app.get('/test', (c) => c.json({ok: true}));
  app.post('/test', (c) => c.json({ok: true}));
  return app;
}

function requestWithIp(path: string, ip: string, method = 'GET') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {'x-forwarded-for': ip},
  });
}

describe('rate-limit middleware', () => {
  describe('global rate limit', () => {
    let app: Hono;

    beforeEach(() => {
      app = createTestApp(createGlobalRateLimit());
    });

    it('allows requests under the limit', async () => {
      const res = await app.request(requestWithIp('/test', '1.2.3.4'));

      expect(res.status).toBe(200);
      expect(res.headers.get('RateLimit-Limit')).toBe('100');
      expect(res.headers.get('RateLimit-Remaining')).toBe('99');
    });

    it('returns 429 with error body when limit is exceeded', async () => {
      // Use a dedicated rate limiter with low limit for fast testing
      const strictApp = createTestApp(createAuthRateLimit());

      for (let i = 0; i < 10; i++) {
        await strictApp.request(requestWithIp('/test', '10.0.0.1'));
      }

      const res = await strictApp.request(requestWithIp('/test', '10.0.0.1'));

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.message).toEqual(expect.any(String));
    });

    it('tracks limits independently per IP', async () => {
      const strictApp = createTestApp(createAuthRateLimit());

      for (let i = 0; i < 10; i++) {
        await strictApp.request(requestWithIp('/test', '10.0.0.1'));
      }

      // Different IP should still be allowed
      const res = await strictApp.request(requestWithIp('/test', '10.0.0.2'));
      expect(res.status).toBe(200);
    });

    it('includes RateLimit headers', async () => {
      const res = await app.request(requestWithIp('/test', '5.5.5.5'));

      expect(res.headers.get('RateLimit-Limit')).toBeDefined();
      expect(res.headers.get('RateLimit-Remaining')).toBeDefined();
      expect(res.headers.get('RateLimit-Reset')).toBeDefined();
    });
  });

  describe('auth rate limit', () => {
    let app: Hono;

    beforeEach(() => {
      app = createTestApp(createAuthRateLimit());
    });

    it('allows up to 10 requests per minute', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request(requestWithIp('/test', '20.0.0.1'));
        expect(res.status).toBe(200);
      }

      const res = await app.request(requestWithIp('/test', '20.0.0.1'));
      expect(res.status).toBe(429);
    });
  });

  describe('payment execute rate limit', () => {
    let app: Hono;

    beforeEach(() => {
      app = createTestApp(createPaymentExecuteRateLimit());
    });

    it('allows up to 10 requests per 5 minutes', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request(requestWithIp('/test', '30.0.0.1', 'POST'));
        expect(res.status).toBe(200);
      }

      const res = await app.request(requestWithIp('/test', '30.0.0.1', 'POST'));
      expect(res.status).toBe(429);
    });
  });
});
