import {createLogger} from "@bim/lib/logger";
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';

import type {Logger} from 'pino';
import {AppContext, type AppContextOverrides} from "./app-context";
import {DatabaseConnection} from '@bim/db/connection';
import {createRequestLoggerMiddleware} from './middleware/request-logger.middleware';
import {SwapMonitor} from './monitoring/swap.monitor';
import {
  createAccountRoutes,
  createAdminRoutes,
  createAuthRoutes,
  createCurrencyRoutes,
  createHealthRoutes,
  createPaymentRoutes,
  createSwapRoutes,
  createUserRoutes,
} from './routes';
import {AppConfig} from './app-config';

export interface CreateAppOptions {
  config?: Partial<AppConfig.Config>;
  context?: AppContextOverrides;
  skipStaticFiles?: boolean;
  skipMonitor?: boolean;
}

export interface AppInstance {
  app: Hono;
  monitor: SwapMonitor | null;
  rootLogger: Logger;
}

/**
 * Creates the Hono application.
 * Can be customized for testing by passing context overrides.
 */
export async function createApp(options: CreateAppOptions = {}): Promise<AppInstance> {
  const rootLogger: Logger = createLogger('debug');
  const logger: Logger = rootLogger.child({name: 'app.ts'});
  const config = {
    ...AppConfig.load(),
    ...options.config
  };
  rootLogger.level = config.logLevel;
  logger.info(AppConfig.redact(config), "Application configuration:");
  await DatabaseConnection.initialize(config.database, rootLogger);
  const dbConnection = DatabaseConnection.get();
  const db = dbConnection.getDb();
  const context = AppContext.createDefault(config, db, rootLogger, options.context);
  const app = new Hono();

  app.use('*', createRequestLoggerMiddleware(context.logger, {
    apiOnly: true,
    silencedPaths: [
      '/api/auth',
      '/api/user/settings',
      '/api/currency/prices'
    ],
  }));
  app.use('/api/*', cors({
      origin: config.webauthn.origin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // API routes
  app.route('/api/account', createAccountRoutes(context));
  app.route('/api/admin', createAdminRoutes(context));
  app.route('/api/auth', createAuthRoutes(context));
  app.route('/api/currency', createCurrencyRoutes(context));
  app.route('/api/health', createHealthRoutes());
  app.route('/api/payment', createPaymentRoutes(context));
  app.route('/api/swap', createSwapRoutes(context));
  app.route('/api/user', createUserRoutes(context));

  // Serve static files (frontend) - skip for tests
  if (!options.skipStaticFiles) {
    app.use('/*', serveStatic({root: './public/app'}));
    app.get('*', serveStatic({path: './public/app/index.html'}));
  }

  // Swap monitor (background polling + auto-claim)
  let monitor: SwapMonitor | null = null;
  if (!options.skipMonitor) {
    monitor = new SwapMonitor(
      context.services.swap,
      context.logger,
    );
  }

  return {app, monitor, rootLogger: rootLogger};
}
