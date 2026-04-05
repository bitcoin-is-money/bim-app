import type {SanitizedError} from '@bim/domain/shared';

const MAX_SUMMARY_LENGTH = 200;

/**
 * Subset of SanitizedError kinds that represent a confirmed infrastructure
 * failure (network layer, reverse proxy, DNS, etc.) — as opposed to a
 * functional error from the SDK or an unrecognized shape. Only these kinds
 * should flip the HealthRegistry into `down` and trigger a Slack alert.
 */
const INFRA_FAILURE_KINDS = new Set([
  'cloudflare_tunnel',
  'html_response',
  'network',
  'timeout',
]);

export function isInfraFailure(error: SanitizedError): boolean {
  return INFRA_FAILURE_KINDS.has(error.kind);
}

/**
 * Turns an arbitrary error thrown by the Atomiq SDK into a compact,
 * log-safe SanitizedError.
 *
 * The Atomiq SDK's _RequestError embeds the raw HTTP response body in its
 * message field. When the LP intermediary is behind a Cloudflare Tunnel
 * that is currently down, that body is a multi-kilobyte HTML error page
 * that floods the logs if printed verbatim. This helper detects common
 * failure shapes and returns a short summary instead.
 */
export function sanitizeAtomiqError(err: unknown): SanitizedError {
  if (!(err instanceof Error)) {
    return {
      kind: 'unknown',
      summary: truncate(String(err)),
    };
  }

  const originalName = err.name;
  const httpCode = extractHttpCode(err);
  const rawMessage = err.message;
  const looksLikeHtml = isHtmlBody(rawMessage);

  if (looksLikeHtml && /cloudflare\s+tunnel\s+error/i.test(rawMessage)) {
    const httpCodeDetails = httpCode === undefined ? '' : `, HTTP ${httpCode}`;
    return {
      kind: 'cloudflare_tunnel',
      ...(httpCode !== undefined && {httpCode}),
      summary: `Atomiq intermediary unreachable (Cloudflare Tunnel error${httpCodeDetails})`,
      originalName,
    };
  }

  if (looksLikeHtml) {
    const httpCodeDetails = httpCode === undefined ? '' : `, HTTP ${httpCode}`;
    return {
      kind: 'html_response',
      ...(httpCode !== undefined && {httpCode}),
      summary: `Atomiq intermediary returned an HTML error page${httpCodeDetails}`,
      originalName,
    };
  }

  if (/timeout|timed out/i.test(rawMessage)) {
    return {
      kind: 'timeout',
      ...(httpCode !== undefined && {httpCode}),
      summary: truncate(rawMessage),
      originalName,
    };
  }

  if (/network|ECONN|ENOTFOUND|fetch failed|socket/i.test(rawMessage)) {
    return {
      kind: 'network',
      ...(httpCode !== undefined && {httpCode}),
      summary: truncate(rawMessage),
      originalName,
    };
  }

  return {
    kind: 'unknown',
    ...(httpCode !== undefined && {httpCode}),
    summary: truncate(rawMessage),
    originalName,
  };
}

function isHtmlBody(message: string): boolean {
  const trimmed = message.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<html');
}

function extractHttpCode(err: Error): number | undefined {
  const candidate = (err as unknown as {httpCode?: unknown}).httpCode;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  return undefined;
}

function truncate(text: string): string {
  const cleaned = text.replaceAll(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_SUMMARY_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_SUMMARY_LENGTH)}…`;
}
