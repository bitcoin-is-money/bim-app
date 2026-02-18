// =============================================================================
// Health Entrypoint — Wraps the Apibara indexer with an HTTP health endpoint
// =============================================================================
// Scaleway Serverless Containers require an HTTP port for health checks.
// This script spawns the indexer as a child process with an IPC channel.
// The indexer sends heartbeat messages on each block processed.
// Health is determined by whether a heartbeat was received within the last
// STALE_THRESHOLD_MS milliseconds.
//
// Env vars:
//   PORT    — HTTP port (default: 8080)
//   PRESET  — Apibara preset (e.g. "mainnet", "testnet")

import {spawn} from 'node:child_process';
import {createServer} from 'node:http';

const port = Number(process.env.PORT) || 8080;
const preset = process.env.PRESET || 'mainnet';
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// Start the indexer as a child process with the IPC channel
const indexer = spawn(
  'node',
  ['.apibara/build/start.mjs', 'start', '--indexer', 'wbtc-transfers', '--preset', preset],
  {stdio: ['inherit', 'inherit', 'inherit', 'ipc']},
);

let indexerRunning = true;
let lastHeartbeat = 0;

indexer.on('message', (msg) => {
  if (msg?.type === 'heartbeat') {
    lastHeartbeat = Date.now();
  }
});

indexer.on('exit', (code) => {
  indexerRunning = false;
  console.error(`Indexer exited with code ${code}`);
  process.exit(code ?? 1);
});

// Minimal HTTP server for health checks
const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const now = Date.now();
    let status;
    let httpCode;

    if (!indexerRunning) {
      status = 'dead';
      httpCode = 503;
    } else if (lastHeartbeat === 0) {
      status = 'starting';
      httpCode = 503;
    } else if (now - lastHeartbeat > STALE_THRESHOLD_MS) {
      status = 'stale';
      httpCode = 503;
    } else {
      status = 'healthy';
      httpCode = 200;
    }

    res.writeHead(httpCode, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({status, lastHeartbeat}));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(port, () => {
  console.log(`Health server listening on port ${port}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  indexer.kill(signal);
  server.close();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
