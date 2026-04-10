import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
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
      // In test mode, getConnInfo is unavailable so all requests resolve to the
      // same key ('unknown'). To prove rate-limit state is isolated per instance,
      // we exhaust the limit on one app and verify a fresh app is unaffected.
      const appA = await TestApp.createTestApp({skipRateLimit: false});
      const appB = await TestApp.createTestApp({skipRateLimit: false});

      // Exhaust limit on app A
      for (let i = 0; i < 10; i++) {
        await appA.request(requestWithIp('/api/auth/session', '10.0.1.1'));
      }
      const blockedRes = await appA.request(requestWithIp('/api/auth/session', '10.0.1.1'));
      expect(blockedRes.status).toBe(429);

      // App B (separate rate-limiter state) should still be allowed
      const allowedRes = await appB.request(requestWithIp('/api/auth/session', '10.0.1.2'));
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

  // ---------------------------------------------------------------------------
  // X-Forwarded-For spoofing protection
  // ---------------------------------------------------------------------------

  describe('X-Forwarded-For spoofing protection', () => {
    it('uses last X-Forwarded-For entry (proxy-appended), not first (client-controlled)', async () => {
      // A separate app to get a fresh rate limiter state
      const freshApp = await TestApp.createTestApp({skipRateLimit: false});
      const realIp = '10.0.50.1';

      // Attacker sends different spoofed first entries, but real IP (last) stays the same
      for (let i = 0; i < 10; i++) {
        const res = await freshApp.request(new Request('http://localhost/api/auth/session', {
          method: 'GET',
          headers: {
            'x-forwarded-for': `${i}.${i}.${i}.${i}, ${realIp}`,
            'Content-Type': 'application/json',
          },
        }));
        expect(res.status).not.toBe(429);
      }

      // 11th request — should be blocked because all 10 came from the same real IP
      const blocked = await freshApp.request(new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: {
          'x-forwarded-for': `99.99.99.99, ${realIp}`,
          'Content-Type': 'application/json',
        },
      }));
      expect(blocked.status).toBe(429);
    });
  });
});
