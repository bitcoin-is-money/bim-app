/**
 * Per-component health entry from GET /api/health.
 * Mirrors ServiceHealthEntry from API health.types.ts.
 */
export interface ServiceHealthEntry {
  readonly name: string;
  readonly status: 'healthy' | 'down';
  readonly downSince?: string;
  readonly lastError?: {
    readonly kind: string;
    readonly httpCode?: number;
    readonly summary: string;
  };
}

export interface HealthCheckResult {
  readonly url: string;
  readonly httpStatus: number;
  readonly healthy: boolean;
  readonly status: 'healthy' | 'degraded';
  readonly timestamp: string;
  readonly checks: { readonly database: 'ok' | 'error' };
  readonly services: readonly ServiceHealthEntry[];
}

/**
 * Checks the health of a BIM API server.
 * Returns the full structured response — callers decide how to display it.
 */
export async function checkApiHealth(baseUrl: string): Promise<HealthCheckResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/health`;

  const response = await fetch(url, {signal: AbortSignal.timeout(10_000)});
  const body = await response.json() as {
    status: 'healthy' | 'degraded';
    timestamp: string;
    checks: { database: 'ok' | 'error' };
    services: ServiceHealthEntry[];
  };

  return {
    url,
    httpStatus: response.status,
    healthy: response.status === 200,
    status: body.status,
    timestamp: body.timestamp,
    checks: body.checks,
    services: body.services,
  };
}
