import {serve} from '@hono/node-server';

import {createApp} from './app';
import {DatabaseConnection} from '@bim/db/connection';
import {loadEnv} from './load-env';

loadEnv();

// =============================================================================
// Server Startup
// =============================================================================

const {app, monitor, rootLogger} = await createApp();
const logger = rootLogger.child({name: 'main.ts'});
const port = Number(process.env.PORT) || 8080;

logger.info('Starting server');

const server = serve({
  fetch: app.fetch,
  port,
});

// Start swap monitor
if (monitor) {
  monitor.start();
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info({signal}, 'Shutting down');
  if (monitor) {
    await monitor.stop();
  }
  server.close();
  await DatabaseConnection.get().close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM')
  .catch((err : unknown) => {
    logger.error(err, 'Shutdown failed');
    process.exit(1);
  }));
process.on('SIGINT', () => void shutdown('SIGINT')
  .catch((err : unknown) => {
    logger.error(err, 'Shutdown failed');
    process.exit(1);
  }));

logger.info('Server ready');
