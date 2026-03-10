import type pg from 'pg';
import type {Hono} from 'hono';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {TestApp, TestDatabase} from '../helpers';

/**
 * Security Response Headers — Integration Tests
 *
 * Verifies that every API response includes defense-in-depth headers
 * to mitigate clickjacking, MIME sniffing, and other client-side attacks.
 */
describe('Security response headers', () => {
  let app: Hono;
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    app = await TestApp.createTestApp();
  });

  afterAll(async () => {
    await pool.end();
  });

  async function getHeaders(path = '/api/health/live'): Promise<Headers> {
    const res = await app.request(path);
    expect(res.status).toBe(200);
    return res.headers;
  }

  it('sets X-Content-Type-Options to nosniff', async () => {
    const headers = await getHeaders();
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const headers = await getHeaders();
    expect(headers.get('x-frame-options')).toBe('DENY');
  });

  it('sets Referrer-Policy to strict-origin-when-cross-origin', async () => {
    const headers = await getHeaders();
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy to restrict sensitive APIs', async () => {
    const headers = await getHeaders();
    const policy = headers.get('permissions-policy');
    expect(policy).not.toBeNull();
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
  });

  it('sets Strict-Transport-Security for HTTPS enforcement', async () => {
    const headers = await getHeaders();
    const hsts = headers.get('strict-transport-security');
    expect(hsts).not.toBeNull();
    expect(hsts).toContain('max-age=');
  });
});
