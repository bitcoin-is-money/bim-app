import type {Hono} from 'hono';
import {createApp, type CreateAppOptions} from '../../../src/app.js';
import {DatabaseConnection} from '../../../src/db/index.js';

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
    DatabaseConnection.reset();
    const {app} = await createApp({
      skipStaticFiles: true,
      skipMonitor: true,
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
