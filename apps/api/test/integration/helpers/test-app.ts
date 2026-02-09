import type {Hono} from 'hono';
import {createApp, type AppInstance, type CreateAppOptions} from '../../../src/app.js';
import {DEVNET_ACCOUNT_CLASS_HASH} from './devnet-paymaster.gateway.js';

export namespace TestApp {

  /**
   * Sets up required environment variables for tests.
   * Call this before creating the test app.
   *
   * Set by 'global-setup.ts':
   *  - process.env.DATABASE_URL
   *  - process.env.DEVNET_URL
   *  - process.env.STARKNET_RPC_URL
   */
  function setupTestEnv(): void {
    process.env.STARKNET_RPC_URL ??= 'http://localhost:5050';
    process.env.ACCOUNT_CLASS_HASH ??= DEVNET_ACCOUNT_CLASS_HASH;
    process.env.WEBAUTHN_RP_ID ??= 'localhost';
    process.env.WEBAUTHN_RP_NAME ??= 'BIM Test';
    process.env.WEBAUTHN_ORIGIN ??= 'http://localhost:8080';
    process.env.FEE_TREASURY_ADDRESS ??= '0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0';
    process.env.NODE_ENV ??= 'test';
  }

  /**
   * Creates a test application instance.
   * Automatically sets up required environment variables and skips static files/logger.
   */
  export function createTestApp(options: CreateAppOptions = {}): Hono {
    setupTestEnv();
    const {app} = createApp({
      skipStaticFiles: true,
      skipLogger: true,
      skipMonitor: true,
      ...options,
    });
    return app;
  }

  /**
   * Creates a test application instance with a SwapMonitor.
   * Use this when tests need to call monitor.runIteration() directly.
   */
  export function createTestAppWithSwapMonitor(options: CreateAppOptions = {}): AppInstance {
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
      get: (path: string, init?: RequestInit) => app.request(path, {method: 'GET', ...init}),

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

      delete: (path: string, init?: RequestInit) => app.request(path, {method: 'DELETE', ...init}),
    };
  }
}




