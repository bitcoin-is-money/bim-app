import {Database} from '@bim/db/database';
import {createLogger} from "@bim/lib/logger";
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';

import type {Logger} from 'pino';
import {AppConfig} from './app-config';
import {AppContext, type AppContextOverrides} from "./app-context";
import {runStartupHealthChecks} from './app-startup-health';
import {createApiCacheHeadersMiddleware} from './middleware/api-cache-headers.middleware';
import {installGlobalErrorHandler} from './middleware/global-error-handler';
import {createPwaCacheHeadersMiddleware} from './middleware/pwa-cache-headers.middleware';
import {
  createAuthRateLimit,
  createGlobalRateLimit,
  createPaymentExecuteRateLimit,
  createPaymentRateLimit
} from './middleware/rate-limit.middleware';
import {createRequestLoggerMiddleware} from './middleware/request-logger.middleware';
import {createSecurityHeadersMiddleware} from './middleware/security-headers.middleware';
import {ActivityMonitoring} from './monitoring/activity.monitoring';
import {BalanceMonitoring} from './monitoring/balance.monitoring';
import {SwapMonitor} from './monitoring/swap.monitor';
import {
  createAccountRoutes,
  createAuthRoutes,
  createCronRoutes,
  createCurrencyRoutes,
  createHealthRoutes,
  createPaymentRoutes,
  createSwapRoutes,
  createUserRoutes,
} from './routes';

export interface CreateAppOptions {
  config?: Partial<AppConfig.Config>;
  context?: AppContextOverrides;
  skipStaticFiles?: boolean;
  skipMonitor?: boolean;
  skipRateLimit?: boolean;
  /**
   * Skip startup health checks entirely. Primarily used by tests to avoid
   * hitting real external services (Starknet, AVNU, CoinGecko) during boot.
   */
  skipStartupHealthChecks?: boolean;
}

export interface AppInstance {
  app: Hono;
  swapMonitor: SwapMonitor | null;
  rootLogger: Logger;
  context: AppContext;
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
    apiOnly: !config.logAllRequests,
    silencedPaths: config.logAllRequests ? [] : [
      '/api/auth',
      '/api/user/settings',
      '/api/currency/prices'
    ],
  }));
  app.use('/api/*', createApiCacheHeadersMiddleware());
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
  // Database check is blocking (process.exit on failure). All other checks
  // run in parallel with a global timeout and never block startup — failures
  // flip the registry and trigger Slack alerts.
  if (!options.skipStartupHealthChecks) {
    await runStartupHealthChecks(context, rootLogger, config.healthCheck.startupTimeoutMs);
  }

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
    const activityMonitoring = new ActivityMonitoring(
      context.repositories.account,
      context.repositories.transaction,
      context.gateways.notification,
      config.starknet,
      rootLogger,
    );
    createCronRoutes(app, {
      cronSecret: config.cron.secret,
      balanceMonitoring,
      activityMonitoring,
      logger: rootLogger,
    });
  }

  // Serve static files (frontend) - skip for tests
  if (!options.skipStaticFiles) {
    // Must run before serveStatic so that post-next() header writes can
    // override any Cache-Control set by the static file handler.
    app.use('/*', createPwaCacheHeadersMiddleware());
    app.use('/*', serveStatic({root: './public/app'}));
    app.get('*', async (c, next) => {
      // SPA fallback: every unmatched path returns index.html. The entry
      // HTML must never be cached or users can end up referencing hashed
      // bundles that no longer exist after a deploy.
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      return serveStatic({path: './public/app/index.html'})(c, next);
    });
  }

  return {app, swapMonitor, rootLogger: rootLogger, context};
}
