import {serializeError} from './serialize-error';

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

/**
 * Subset of SanitizedError kinds that represent a confirmed infrastructure
 * failure (network layer, reverse proxy, DNS, etc.) — as opposed to a
 * functional error from the SDK or an unrecognized shape. Only these kinds
 * should flip the HealthRegistry into `down` and trigger a Slack alert.
 */
const INFRA_FAILURE_KINDS: ReadonlySet<SanitizedErrorKind> = new Set([
  'cloudflare_tunnel',
  'html_response',
  'network',
  'timeout',
]);

export namespace SanitizedError {
  const TIMEOUT_KEYWORDS: readonly string[] = ['timed out', 'timeout', 'aborted'];
  const NETWORK_KEYWORDS: readonly string[] = ['fetch', 'network', 'econn', 'enotfound', 'socket'];

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
    const message = serializeError(err);
    const lower = message.toLowerCase();
    if (TIMEOUT_KEYWORDS.some(kw => lower.includes(kw))) {
      return {kind: 'timeout', summary: `${service} timeout: ${message}`};
    }
    if (NETWORK_KEYWORDS.some(kw => lower.includes(kw))) {
      return {kind: 'network', summary: `${service} unreachable: ${message}`};
    }
    return {kind: 'unknown', summary: `${service} error: ${message}`};
  }

  export function isInfraFailure(error: SanitizedError): boolean {
    return INFRA_FAILURE_KINDS.has(error.kind);
  }
}
