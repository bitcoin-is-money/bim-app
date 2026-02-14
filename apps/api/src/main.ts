import {serve} from '@hono/node-server';
import {createApp} from './app';
import {closeDb, setPoolLogger} from './db';
import {loadEnv} from './load-env';

loadEnv();

// =============================================================================
// Server Startup
// =============================================================================

const {app, monitor, rootLogger} = createApp();
const port = Number(process.env.PORT) || 8080;

// Wire the logger to the database pool for error reporting
setPoolLogger(rootLogger);

rootLogger.info({port, env: process.env.NODE_ENV || 'development'}, 'Starting server');

const server = serve({
  fetch: app.fetch,
  port,
});

// Start swap monitor
if (monitor) {
  monitor.start();
  rootLogger.info('Swap monitor started');
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  rootLogger.info({signal}, 'Shutting down');
  if (monitor) {
    await monitor.stop();
  }
  server.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

rootLogger.info({port}, 'Server ready');
