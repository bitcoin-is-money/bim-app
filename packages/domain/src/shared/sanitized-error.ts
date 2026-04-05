/**
 * Structured, log-safe representation of an error from an external service.
 *
 * External SDKs (notably Atomiq) sometimes embed raw HTTP response bodies
 * (e.g., a 5 KB Cloudflare HTML error page) into their error messages. Dumping
 * those verbatim into pino pollutes logs and makes real debugging harder.
 *
 * A SanitizedError keeps only the information that is actually useful for
 * humans and alerting systems.
 */
export interface SanitizedError {
  readonly kind: SanitizedErrorKind;
  readonly httpCode?: number;
  readonly summary: string;
  readonly originalName?: string;
}

export type SanitizedErrorKind =
  | 'cloudflare_tunnel'
  | 'html_response'
  | 'network'
  | 'timeout'
  | 'unknown';
