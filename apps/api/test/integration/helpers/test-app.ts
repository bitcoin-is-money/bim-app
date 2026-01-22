import type {Hono} from 'hono';
import {createApp, type CreateAppOptions} from '../../../src/app.js';

/**
 * Sets up required environment variables for tests.
 * Call this before creating the test app.
 */
export function setupTestEnv(): void {
  // DATABASE_URL is set by global-setup.ts
  process.env.STARKNET_RPC_URL ??= 'http://localhost:5050';
  process.env.ACCOUNT_CLASS_HASH ??= '0x0';
  process.env.WEBAUTHN_RP_ID ??= 'localhost';
  process.env.WEBAUTHN_RP_NAME ??= 'BIM Test';
  process.env.WEBAUTHN_ORIGIN ??= 'http://localhost:8080';
  process.env.NODE_ENV ??= 'test';
}

/**
 * Creates a test application instance.
 * Automatically sets up required environment variables and skips static files/logger.
 */
export function createTestApp(options: CreateAppOptions = {}): Hono {
  setupTestEnv();

  return createApp({
    skipStaticFiles: true,
    skipLogger: true,
    ...options,
  });
}

/**
 * Helper to make requests to the test app.
 */
export function request(app: Hono) {
  return {
    get: (path: string, init?: RequestInit) =>
      app.request(path, {method: 'GET', ...init}),

    post: (path: string, body?: unknown, init?: RequestInit) =>
      app.request(path, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...init?.headers},
        body: body ? JSON.stringify(body) : undefined,
        ...init,
      }),

    put: (path: string, body?: unknown, init?: RequestInit) =>
      app.request(path, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', ...init?.headers},
        body: body ? JSON.stringify(body) : undefined,
        ...init,
      }),

    delete: (path: string, init?: RequestInit) =>
      app.request(path, {method: 'DELETE', ...init}),
  };
}
