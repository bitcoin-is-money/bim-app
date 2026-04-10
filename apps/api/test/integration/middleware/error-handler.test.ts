import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {TestApp, TestDatabase} from '../helpers';

/**
 * Global Error Handler — Integration Tests
 *
 * Verifies that unhandled errors in the real app never leak
 * stack traces, internal paths, or error messages to clients.
 *
 * Mounts throwable test routes on the real app instance to
 * trigger unhandled errors through the full middleware stack.
 */
describe('Global error handler', () => {
  let app: Hono;
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    app = await TestApp.createTestApp();

    // Mount test routes that simulate unhandled errors
    app.get('/test/throw-sync', () => {
      throw new TypeError('Cannot read properties of undefined');
    });
    app.get('/test/throw-async', async () => {
      throw new Error('async database connection string leaked');
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sanitizes unhandled sync errors into generic INTERNAL_ERROR JSON', async () => {
    const res = await app.request('/test/throw-sync');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  it('sanitizes unhandled async errors into generic INTERNAL_ERROR JSON', async () => {
    const res = await app.request('/test/throw-async');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  it('never exposes internal error messages in the response body', async () => {
    const res = await app.request('/test/throw-async');
    const text = await res.text();

    expect(text).not.toContain('database');
    expect(text).not.toContain('connection');
    expect(text).not.toContain('leaked');
  });

  it('never exposes stack traces or file paths in the response body', async () => {
    const res = await app.request('/test/throw-sync');
    const text = await res.text();

    expect(text).not.toContain('at ');
    expect(text).not.toContain('.ts:');
    expect(text).not.toContain('node_modules');
  });
});
