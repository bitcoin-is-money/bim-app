import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';
import {
  AtomiqSdkGateway,
  AvnuPaymasterGateway,
  DrizzleAccountRepository,
  DrizzleChallengeRepository,
  DrizzleSessionRepository,
  InMemorySwapRepository,
  SimpleWebAuthnGateway,
  StarknetRpcGateway,
} from './adapters';
import {getDb} from './db';
import {
  createAccountRoutes,
  createAuthRoutes,
  createBalanceRoutes,
  createHealthRoutes,
  createSwapRoutes,
  createTransactionRoutes,
} from './routes';
import {type AppConfig, type AppEnv, loadConfig} from './types';

export interface CreateAppOptions {
  config?: Partial<AppConfig>;
  env?: Partial<AppEnv>;
  skipStaticFiles?: boolean;
  skipLogger?: boolean;
}

/**
 * Creates the Hono application.
 * Can be customized for testing by passing options.
 */
export function createApp(options: CreateAppOptions = {}): Hono {
  const config = {...loadConfig(), ...options.config};
  const db = getDb();

  // Create repositories (can be overridden for testing)
  const repositories = options.env?.repositories ?? {
    account: new DrizzleAccountRepository(db),
    session: new DrizzleSessionRepository(db),
    challenge: new DrizzleChallengeRepository(db),
    swap: new InMemorySwapRepository(),
  };

  // Create gateways (can be overridden for testing)
  const gateways = options.env?.gateways ?? {
    webAuthn: new SimpleWebAuthnGateway(),
    starknet: new StarknetRpcGateway({
      rpcUrl: config.starknetRpcUrl,
      accountClassHash: config.accountClassHash,
    }),
    paymaster: new AvnuPaymasterGateway({
      apiUrl: config.avnuApiUrl,
      apiKey: config.avnuApiKey,
    }),
    atomiq: new AtomiqSdkGateway({
      network: config.nodeEnv === 'production' ? 'mainnet' : 'testnet',
      starknetRpcUrl: config.starknetRpcUrl,
    }),
  };

  // Build environment
  const env: AppEnv = {
    repositories,
    gateways,
    webauthn: options.env?.webauthn ?? {
      rpId: config.webauthnRpId,
      rpName: config.webauthnRpName,
      origin: config.webauthnOrigin,
    },
  };

  // Create main Hono app
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
  app.route('/api/auth', createAuthRoutes(env));
  app.route('/api/account', createAccountRoutes(env));
  app.route('/api/swap', createSwapRoutes(env));
  app.route('/api/health', createHealthRoutes());
  app.route('/api/balance', createBalanceRoutes(env));
  app.route('/api/transactions', createTransactionRoutes(env));

  // Serve static files (frontend) - skip for tests
  if (!options.skipStaticFiles) {
    app.use('/*', serveStatic({root: './public'}));
    app.get('*', serveStatic({path: './public/index.html'}));
  }

  return app;
}
