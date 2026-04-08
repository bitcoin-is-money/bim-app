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
  | 'credits'
  | 'html_response'
  | 'network'
  | 'timeout'
  | 'unknown';

export namespace SanitizedError {
  const TIMEOUT_KEYWORDS: readonly string[] = ['timed out', 'timeout', 'aborted'];
  const NETWORK_KEYWORDS: readonly string[] = ['fetch', 'network', 'econnrefused', 'enotfound'];

  /**
   * Generic error sanitizer for calls to external services.
   *
   * Categorizes any error into a SanitizedError with kind `timeout`, `network`
   * or `unknown`, keeping the full original message in the summary so that
   * alerting/logging pipelines retain useful context.
   *
   * The `service` parameter is used as a prefix in the summary to identify
   * which external component produced the error (e.g., "AVNU paymaster",
   * "Starknet RPC", "CoinGecko").
   *
   * Callers that have service-specific error shapes (e.g., AVNU error 163 for
   * exhausted API keys) should do their own matching first and only delegate
   * to this helper for the generic fallback.
   */
  export function sanitize(service: string, err: unknown): SanitizedError {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (TIMEOUT_KEYWORDS.some(kw => lower.includes(kw))) {
      return {kind: 'timeout', summary: `${service} timeout: ${message}`};
    }
    if (NETWORK_KEYWORDS.some(kw => lower.includes(kw))) {
      return {kind: 'network', summary: `${service} unreachable: ${message}`};
    }
    return {kind: 'unknown', summary: `${service} error: ${message}`};
  }
}
