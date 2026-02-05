import {expand} from 'dotenv-expand';
import {config} from 'dotenv';

// Load environment variables from .env file (supports DOTENV_CONFIG_PATH)
expand(config());

import {serve} from '@hono/node-server';
import {createApp} from './app';
import {closeDb} from './db';

// =============================================================================
// Server Startup
// =============================================================================

const {app, monitor} = createApp();
const port = Number(process.env.PORT) || 8080;

console.log(`Starting server on http://localhost:${port}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

const server = serve({
  fetch: app.fetch,
  port,
});

// Start swap monitor
if (monitor) {
  monitor.start();
  console.log('Swap monitor started');
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down...`);
  if (monitor) {
    await monitor.stop();
  }
  server.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log(`Server running on http://localhost:${port}`);
