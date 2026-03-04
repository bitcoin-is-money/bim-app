import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {Hono} from 'hono';
import type {ApiErrorResponse} from '../../../src/errors';
import {TestApp, TestDatabase} from '../helpers';

/**
 * Rate Limit Middleware — Integration Tests
 *
 * Creates an app instance with rate limiting ENABLED (skipRateLimit: false)
 * to verify rate limiting works end-to-end through the full middleware stack.
 *
 * Uses x-forwarded-for headers to simulate different client IPs.
 */
describe('Rate limit middleware (integration)', () => {
  let app: Hono;
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    app = await TestApp.createTestApp({skipRateLimit: false});
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  function requestWithIp(path: string, ip: string, method = 'GET') {
    return new Request(`http://localhost${path}`, {
      method,
      headers: {
        'x-forwarded-for': ip,
        'Content-Type': 'application/json',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Auth rate limit (10 req/min)
  // ---------------------------------------------------------------------------

  describe('auth rate limit', () => {
    it('returns 429 after 10 requests to auth endpoints from the same IP', async () => {
      const ip = '10.0.0.1';

      for (let i = 0; i < 10; i++) {
        const res = await app.request(requestWithIp('/api/auth/session', ip));
        expect(res.status).not.toBe(429);
      }

      const res = await app.request(requestWithIp('/api/auth/session', ip));
      expect(res.status).toBe(429);

      const body = await res.json() as ApiErrorResponse;
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    it('tracks limits independently per IP', async () => {
      // Exhaust limit for IP A
      for (let i = 0; i < 10; i++) {
        await app.request(requestWithIp('/api/auth/session', '10.0.1.1'));
      }
      const blockedRes = await app.request(requestWithIp('/api/auth/session', '10.0.1.1'));
      expect(blockedRes.status).toBe(429);

      // IP B should still be allowed
      const allowedRes = await app.request(requestWithIp('/api/auth/session', '10.0.1.2'));
      expect(allowedRes.status).not.toBe(429);
    });
  });

  // ---------------------------------------------------------------------------
  // Global rate limit (100 req/15min)
  // ---------------------------------------------------------------------------

  describe('global rate limit', () => {
    it('includes RateLimit headers on API responses', async () => {
      const res = await app.request(requestWithIp('/api/health/live', '10.0.2.1'));

      expect(res.status).toBe(200);
      expect(res.headers.get('RateLimit-Limit')).toBeDefined();
      expect(res.headers.get('RateLimit-Remaining')).toBeDefined();
      expect(res.headers.get('RateLimit-Reset')).toBeDefined();
    });
  });
});
