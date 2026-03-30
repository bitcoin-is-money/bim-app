/**
 * Indexer entrypoint — orchestrates three concerns:
 * 1. Spawns the Apibara indexer as a subprocess (IPC heartbeats)
 * 2. Serves /health for Scaleway Serverless Container health checks
 * 3. Starts the BalanceMonitor (cron-based STRK balance alerts)
 *
 * Configuration is loaded from environment variables via IndexerConfig.
 * Alerting is optional but all-or-nothing (partially configured = startup error).
 */

import {spawn} from 'node:child_process';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {createLogger} from '@bim/lib/logger';
import {IndexerConfig} from './indexer-config';
import {createBalanceMonitor} from './monitoring/create-balance-monitor';

const rootLogger = createLogger('info');
const logger = rootLogger.child({name: 'entrypoint.ts'});

let config: IndexerConfig.Config;
try {
  config = IndexerConfig.load();
} catch (error) {
  logger.fatal({err: error}, 'Failed to load configuration');
  process.exit(1);
}

// If no heartbeat received within this window, /health returns 503 (stale)
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

// ── Indexer subprocess ──────────────────────────────────────────────────────

const indexer = spawn(
  'node',
  ['.apibara/build/start.mjs', 'start', '--indexer', 'wbtc-transfers', '--preset', config.preset],
  {stdio: ['inherit', 'inherit', 'inherit', 'ipc']},
);

let indexerRunning = true;
let lastHeartbeat = 0;

indexer.on('message', (msg: unknown) => {
  const message = msg as {type?: string} | undefined;
  if (message?.type === 'heartbeat') {
    lastHeartbeat = Date.now();
  }
});

indexer.on('exit', (code) => {
  indexerRunning = false;
  logger.error({code}, 'Indexer exited');
  process.exit(code ?? 1);
});

// ── Balance monitor ─────────────────────────────────────────────────────────

if (config.alerting) {
  const balanceMonitor = createBalanceMonitor(config, config.alerting, rootLogger);
  balanceMonitor.start();
  logger.info('BalanceMonitor started');
} else {
  logger.info('BalanceMonitor disabled');
}

// ── Health server ───────────────────────────────────────────────────────────

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  const now = Date.now();
  let status: string;
  let httpCode: number;

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
}

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    handleHealth(req, res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(config.port, () => {
  logger.info({port: config.port}, 'Health server listening');
});

// ── Graceful shutdown ───────────────────────────────────────────────────────

function shutdown(signal: NodeJS.Signals): void {
  logger.info({signal}, 'Shutting down');
  indexer.kill(signal);
  server.close();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
