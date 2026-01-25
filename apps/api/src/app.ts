import type {DeepPartial} from "@bim/lib/types/DeepPartial";
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';
import {AppContext} from "./app-context";
import {getDb} from './db';
import {
  createAccountRoutes,
  createAuthRoutes,
  createBalanceRoutes,
  createHealthRoutes,
  createSwapRoutes,
  createTransactionRoutes,
  createUserRoutes,
} from './routes';
import {type AppConfig, loadConfig} from './types';

export interface CreateAppOptions {
  config?: Partial<AppConfig>;
  context?: DeepPartial<AppContext>;
  skipStaticFiles?: boolean;
  skipLogger?: boolean;
}

/**
 * Creates the Hono application.
 * Can be customized for testing by passing context overrides.
 */
export function createApp(options: CreateAppOptions = {}): Hono {
  const config = {...loadConfig(), ...options.config};
  const db = getDb();
  const context = AppContext.mergeContext(
    AppContext.createDefault(config, db),
    options.context);
  const app = new Hono();

  // Middleware
  if (!options.skipLogger) {
    app.use('*', logger());
  }

  app.use(
    '/api/*',
    cors({
      origin: config.webauthnOrigin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // API routes
  app.route('/api/auth', createAuthRoutes(context));
  app.route('/api/account', createAccountRoutes(context));
  app.route('/api/user', createUserRoutes(context));
  app.route('/api/swap', createSwapRoutes(context));
  app.route('/api/health', createHealthRoutes());
  app.route('/api/balance', createBalanceRoutes(context));
  app.route('/api/transactions', createTransactionRoutes(context));

  // Serve static files (frontend) - skip for tests
  if (!options.skipStaticFiles) {
    app.use('/*', serveStatic({root: './public'}));
    app.get('*', serveStatic({path: './public/index.html'}));
  }

  return app;
}
