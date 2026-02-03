import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';
import {AppContext, type AppContextOverrides} from "./app-context";
import {getDb} from './db';
import {SwapMonitor} from './monitoring/swap.monitor';
import {
  createAccountRoutes,
  createAuthRoutes,
  createCurrencyRoutes,
  createHealthRoutes,
  createPaymentRoutes,
  createSwapRoutes,
  createUserRoutes,
} from './routes';
import {type AppConfig, loadConfig} from './types';

export interface CreateAppOptions {
  config?: Partial<AppConfig>;
  context?: AppContextOverrides;
  skipStaticFiles?: boolean;
  skipLogger?: boolean;
  skipMonitor?: boolean;
}

export interface AppInstance {
  app: Hono;
  monitor: SwapMonitor | null;
}

/**
 * Creates the Hono application.
 * Can be customized for testing by passing context overrides.
 */
export function createApp(options: CreateAppOptions = {}): AppInstance {
  const config = {...loadConfig(), ...options.config};
  const db = getDb();
  const context = AppContext.createDefault(config, db, options.context);
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
  app.route('/api/account', createAccountRoutes(context));
  app.route('/api/auth', createAuthRoutes(context));
  app.route('/api/currency', createCurrencyRoutes());
  app.route('/api/health', createHealthRoutes());
  app.route('/api/payment', createPaymentRoutes(context));
  app.route('/api/swap', createSwapRoutes(context));
  app.route('/api/user', createUserRoutes(context));

  // Serve static files (frontend) - skip for tests
  if (!options.skipStaticFiles) {
    app.use('/*', serveStatic({root: './public'}));
    app.get('*', serveStatic({path: './public/index.html'}));
  }

  // Swap monitor (background polling + auto-claim)
  let monitor: SwapMonitor | null = null;
  if (!options.skipMonitor) {
    monitor = new SwapMonitor(context.services.swap);
  }

  return {app, monitor};
}
