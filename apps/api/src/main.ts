import {serve} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';
import {AtomiqSdkGateway, AvnuPaymasterGateway, SimpleWebAuthnGateway, StarknetRpcGateway,} from './adapters/gateways';
import {
  DrizzleAccountRepository,
  DrizzleChallengeRepository,
  DrizzleSessionRepository,
  InMemorySwapRepository,
} from './adapters/persistence';
import {closeDb, getDb} from './db/connection';
import {
  createAccountRoutes,
  createAuthRoutes,
  createBalanceRoutes,
  createHealthRoutes,
  createSwapRoutes,
  createTransactionRoutes,
} from './routes';
import {type AppEnv, loadConfig} from './types';

// =============================================================================
// Application Setup
// =============================================================================

function createApp(): Hono {
  const config = loadConfig();
  const db = getDb();

  // Create repositories
  const repositories = {
    account: new DrizzleAccountRepository(db),
    session: new DrizzleSessionRepository(db),
    challenge: new DrizzleChallengeRepository(db),
    swap: new InMemorySwapRepository(),
  };

  // Create gateways
  const gateways = {
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
    webauthn: {
      rpId: config.webauthnRpId,
      rpName: config.webauthnRpName,
      origin: config.webauthnOrigin,
    },
  };

  // Create main Hono app
  const app = new Hono();

  // Middleware
  app.use('*', logger());
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

  // Serve static files (frontend)
  app.use('/*', serveStatic({ root: './public' }));

  // SPA fallback - serve index.html for all unmatched routes
  app.get('*', serveStatic({ path: './public/index.html' }));

  return app;
}

// =============================================================================
// Server Startup
// =============================================================================

const app = createApp();
const port = Number(process.env.PORT) || 8080;

console.log(`Starting server on http://localhost:${port}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

const server = serve({
  fetch: app.fetch,
  port,
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  server.close();
  await closeDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  server.close();
  await closeDb();
  process.exit(0);
});

console.log(`Server running on http://localhost:${port}`);
