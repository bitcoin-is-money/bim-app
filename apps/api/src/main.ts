import {serve} from '@hono/node-server';
import {createApp} from './app';
import {closeDb} from './db';

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
