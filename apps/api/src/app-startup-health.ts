import {Database} from '@bim/db/database';
import type {Logger} from 'pino';
import type {AppContext} from './app-context';

/**
 * Runs health checks for all tracked components immediately after startup.
 *
 * The database check is awaited first and exits the process on failure —
 * without a working database the app cannot serve any traffic.
 *
 * All other external service checks run in parallel with a global timeout.
 * They are never allowed to block startup and failures only flip the
 * in-memory HealthRegistry (which triggers Slack alerts via the notification
 * gateway wired in `AppContext`).
 */
export async function runStartupHealthChecks(
  context: AppContext,
  rootLogger: Logger,
  healthChecksTimeoutMs: number,
): Promise<void> {
  const log = rootLogger.child({name: 'app-startup-health.ts'});

  // 1. Database check is blocking — a down DB means the app cannot serve traffic.
  const dbOk = await pingDatabaseAtStartup(context);
  if (!dbOk) {
    log.fatal('Database unreachable at startup — aborting');
    process.exit(1);
  }

  // 2. All other external services run in parallel with a global timeout.
  const externalChecks: Promise<void>[] = [
    context.gateways.starknet.checkHealth(),
    context.gateways.paymaster.checkHealth(),
    context.gateways.atomiq.checkHealth(),
    context.gateways.dex.checkHealth(),
    context.gateways.price.checkHealth(),
  ];

  const timeout = new Promise<'timeout'>(resolve => {
    setTimeout(() => { resolve('timeout'); }, healthChecksTimeoutMs);
  });

  const raceResult = await Promise.race([
    Promise.allSettled(externalChecks).then(() => 'done' as const),
    timeout,
  ]);
  if (raceResult === 'timeout') {
    log.warn({timeoutMs: healthChecksTimeoutMs}, 'Startup health checks exceeded global timeout');
  }

  // 3. Log a structured summary from the registry snapshot.
  const snapshot = context.healthRegistry.getState();
  const summary: Record<string, string> = {};
  for (const comp of snapshot.components) {
    summary[comp.name] = comp.status === 'healthy' ? 'ok' : `down(${comp.lastError?.kind ?? 'unknown'})`;
  }
  log.info({overall: snapshot.overall, services: summary}, 'Startup health check summary');
}

async function pingDatabaseAtStartup(context: AppContext): Promise<boolean> {
  try {
    const ok = await Database.get().testConnection();
    if (ok) {
      context.healthRegistry.reportHealthy('database');
      return true;
    }
    context.healthRegistry.reportDown('database', {
      kind: 'unknown',
      summary: 'Database connection test failed at startup',
    });
    return false;
  } catch (err: unknown) {
    context.healthRegistry.reportDown('database', {
      kind: 'unknown',
      summary: err instanceof Error ? err.message : 'Database connection test failed at startup',
    });
    return false;
  }
}
