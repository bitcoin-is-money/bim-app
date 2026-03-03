import {DatabaseConnection} from "@bim/db/connection";
import type {Hono} from 'hono';
import {type AppInstance, createApp, type CreateAppOptions} from '../../../src/app';
import {DEVNET_ACCOUNT_CLASS_HASH} from './devnet-paymaster.gateway';

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
    process.env.WBTC_TOKEN_ADDRESS ??= '0x00123';
    process.env.ATOMIQ_STORAGE_PATH ??= '/tmp/bim/atomiq';
    process.env.ATOMIQ_AUTO_CREATE_STORAGE ??= 'true';
    process.env.ATOMIQ_SWAP_TOKEN ??= 'WBTC';
    process.env.NODE_ENV ??= 'test';
    process.env.LOG_LEVEL ??= 'silent';
  }

  /**
   * Creates a test application instance with silent logging.
   */
  export async function createTestApp(options: CreateAppOptions = {}): Promise<Hono> {
    setupTestEnv();
    DatabaseConnection.reset();
    const {app} = await createApp({
      skipStaticFiles: true,
      skipMonitor: true,
      skipRateLimit: true,
      config: {logLevel: 'silent'},
      ...options,
    });
    return app;
  }

  /**
   * Creates a test application with visible logging (logLevel: 'info').
   * Logs appear in the vitest console output.
   */
  export async function createTestAppWithLogger(options: CreateAppOptions = {}): Promise<AppInstance> {
    setupTestEnv();
    DatabaseConnection.reset();
    return createApp({
      skipStaticFiles: true,
      skipMonitor: true,
      skipRateLimit: true,
      config: {logLevel: 'info'},
      ...options,
    });
  }

  /**
   * Creates a test application instance with a SwapMonitor.
   * Use this when tests need to call monitor.runIteration() directly.
   */
  export async function createTestAppWithSwapMonitor(options: CreateAppOptions = {}): Promise<AppInstance> {
    setupTestEnv();
    DatabaseConnection.reset();
    return createApp({
      skipStaticFiles: true,
      skipRateLimit: true,
      config: {logLevel: 'silent'},
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
          headers: {'Content-Type': 'application/json', ...Object.fromEntries(new Headers(init?.headers))},
          body: body ? JSON.stringify(body) : null,
          ...init,
        }),

      put: (path: string, body?: unknown, init?: RequestInit) =>
        app.request(path, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json', ...Object.fromEntries(new Headers(init?.headers))},
          body: body ? JSON.stringify(body) : null,
          ...init,
        }),

      delete: (path: string, init?: RequestInit) => app.request(path, {method: 'DELETE', ...init}),
    };
  }
}
