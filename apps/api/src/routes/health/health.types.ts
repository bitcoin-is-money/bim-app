/** Per-component health entry returned by GET /api/health. */
export interface ServiceHealthEntry {
  name: string;
  status: 'unknown' | 'healthy' | 'down';
  downSince?: string;
  lastError?: {
    kind: string;
    httpCode?: number;
    summary: string;
  };
}

/** API response from GET /api/health */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
  };
  services: ServiceHealthEntry[];
}

/** API response from GET /api/health/ready */
export interface ReadyResponse {
  ready: boolean;
}

/** API response from GET /api/health/live */
export interface LiveResponse {
  live: boolean;
}
