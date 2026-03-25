import {createLogger} from "@bim/lib/logger";
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';

import type {Logger} from 'pino';
import {AppContext, type AppContextOverrides} from "./app-context";
import {Database} from '@bim/db/database';
import {createGlobalRateLimit, createAuthRateLimit, createPaymentRateLimit, createPaymentExecuteRateLimit} from './middleware/rate-limit.middleware';
import {createRequestLoggerMiddleware} from './middleware/request-logger.middleware';
import {createSecurityHeadersMiddleware} from './middleware/security-headers.middleware';
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
import {installGlobalErrorHandler} from './middleware/global-error-handler';

export interface CreateAppOptions {
  config?: Partial<AppConfig.Config>;
  context?: AppContextOverrides;
  skipStaticFiles?: boolean;
  skipMonitor?: boolean;
  skipRateLimit?: boolean;
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
  await Database.initialize(config.database, rootLogger);
  const db = Database.get();
  const context = AppContext.createDefault(config, db, rootLogger, options.context);
  const app = new Hono();
  installGlobalErrorHandler(app);

  app.use('*', createSecurityHeadersMiddleware());
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

  // Rate limiting
  if (!options.skipRateLimit) {
    app.use('/api/*', createGlobalRateLimit());
    app.use('/api/auth/*', createAuthRateLimit());
    app.use('/api/payment/*', createPaymentRateLimit());
    app.use('/api/payment/pay/execute', createPaymentExecuteRateLimit());
  }

  // API routes
  app.route('/api/account', createAccountRoutes(context));
  //app.route('/api/admin', createAdminRoutes(context));
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
      context.gateways.atomiq,
      context.logger,
    );
  }

  return {app, monitor, rootLogger: rootLogger};
}
