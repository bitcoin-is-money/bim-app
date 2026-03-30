import {serve} from '@hono/node-server';

import {createApp} from './app';
import {Database} from '@bim/db/database';
import {loadEnv} from './load-env';

loadEnv();

// =============================================================================
// Server Startup
// =============================================================================

const {app, swapMonitor, rootLogger} = await createApp();
const logger = rootLogger.child({name: 'main.ts'});
const port = Number(process.env.PORT) || 8080;

logger.info('Starting server');

const server = serve({
  fetch: app.fetch,
  port,
});

// Start monitors
if (swapMonitor) {
  swapMonitor.start();
}
// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info({signal}, 'Shutting down');
  if (swapMonitor) {
    await swapMonitor.stop();
  }
  server.close();
  await Database.get().close();
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
