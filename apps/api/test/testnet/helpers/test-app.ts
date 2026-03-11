import {Database} from "@bim/db/database";
import type {Hono} from 'hono';
import {createApp, type CreateAppOptions} from '../../../src/app.js';

/**
 * Testnet test app helper.
 *
 * All configuration comes from .env.testnet (loaded by global-setup.ts).
 * No hardcoded values — the env file is the single source of truth.
 */
export namespace TestnetApp {

  /**
   * Creates a test application configured for Sepolia testnet.
   * Uses real Starknet RPC and AVNU paymaster (no devnet mocks).
   */
  export async function createTestApp(options: CreateAppOptions = {}): Promise<Hono> {
    Database.reset();
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
