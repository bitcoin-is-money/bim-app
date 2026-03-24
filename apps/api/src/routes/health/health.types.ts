/** API response from GET /api/health */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
  };
}

/** API response from GET /api/health/ready */
export interface ReadyResponse {
  ready: boolean;
}

/** API response from GET /api/health/live */
export interface LiveResponse {
  live: boolean;
}
