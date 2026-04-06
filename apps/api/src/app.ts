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
  createCronRoutes,
  createCurrencyRoutes,
  createHealthRoutes,
  createPaymentRoutes,
  createSwapRoutes,
  createUserRoutes,
} from './routes';
import {AppConfig} from './app-config';
import {installGlobalErrorHandler} from './middleware/global-error-handler';
import {BalanceMonitoring} from './monitoring/balance.monitoring';

export interface CreateAppOptions {
  config?: Partial<AppConfig.Config>;
  context?: AppContextOverrides;
  skipStaticFiles?: boolean;
  skipMonitor?: boolean;
  skipRateLimit?: boolean;
}

export interface AppInstance {
  app: Hono;
  swapMonitor: SwapMonitor | null;
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
  const pool = db.getPool();
  const context = AppContext.createDefault(config, db, pool, rootLogger, options.context);
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

  // Startup health checks: optimistic init (healthy), verify immediately.
  // Fire-and-forget — failures flip the registry and trigger Slack alerts.
  void runStartupHealthChecks(context, rootLogger);

  // Swap monitor (background polling + auto-claim, auto-stops when idle)
  let swapMonitor: SwapMonitor | null = null;
  if (!options.skipMonitor) {
    swapMonitor = new SwapMonitor(
      context.services.swap,
      context.gateways.atomiq,
      context.logger,
      {keepaliveUrl: config.webauthn.origin},
    );
  }

  // API routes
  app.route('/api/account', createAccountRoutes(context));
  //app.route('/api/admin', createAdminRoutes(context));
  app.route('/api/auth', createAuthRoutes(context));
  app.route('/api/currency', createCurrencyRoutes(context));
  app.route('/api/health', createHealthRoutes(context));
  app.route('/api/payment', createPaymentRoutes(context, swapMonitor));
  app.route('/api/swap', createSwapRoutes(context));
  app.route('/api/user', createUserRoutes(context));

  // Balance monitoring + cron route (Scaleway cron always POSTs to /)
  if (config.cron) {
    const balanceMonitoring = new BalanceMonitoring(
      context.gateways.starknet,
      context.gateways.paymaster,
      context.gateways.notification,
      config.starknet,
      config.cron.balanceMonitoring,
      rootLogger,
    );
    createCronRoutes(app, {
      cronSecret: config.cron.secret,
      balanceMonitoring,
      logger: rootLogger,
    });
  }

  // Serve static files (frontend) - skip for tests
  if (!options.skipStaticFiles) {
    app.use('/*', serveStatic({root: './public/app'}));
    app.get('*', serveStatic({path: './public/app/index.html'}));
  }

  return {app, swapMonitor, rootLogger: rootLogger};
}

/**
 * Runs health checks for all tracked components immediately after startup.
 * Components start as healthy (optimistic). If a check fails, the registry
 * transitions to down and sends a Slack alert right away.
 */
async function runStartupHealthChecks(
  context: AppContext,
  rootLogger: Logger,
): Promise<void> {
  const log = rootLogger.child({name: 'app.ts'});
  const results = await Promise.allSettled([
    pingDatabaseAtStartup(context),
    context.gateways.atomiq.checkHealth(),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      log.warn({cause: result.reason instanceof Error ? result.reason.message : String(result.reason)},
        'Startup health check threw unexpectedly');
    }
  }
}

async function pingDatabaseAtStartup(context: AppContext): Promise<void> {
  try {
    const ok = await Database.get().testConnection();
    if (ok) {
      context.healthRegistry.reportHealthy('database');
    } else {
      context.healthRegistry.reportDown('database', {kind: 'unknown', summary: 'Database connection test failed at startup'});
    }
  } catch (err: unknown) {
    context.healthRegistry.reportDown('database', {
      kind: 'unknown',
      summary: err instanceof Error ? err.message : 'Database connection test failed at startup',
    });
  }
}
