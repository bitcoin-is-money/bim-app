import {SanitizedError, serializeError} from '@bim/lib/error';

const MAX_SUMMARY_LENGTH = 200;

/**
 * Turns an arbitrary error thrown by the Atomiq SDK into a compact,
 * log-safe SanitizedError.
 *
 * The Atomiq SDK's _RequestError embeds the raw HTTP response body in its
 * message field. When the LP intermediary is behind a Cloudflare Tunnel
 * that is currently down, that body is a multi-kilobyte HTML error page
 * that floods the logs if printed verbatim. This helper detects common
 * failure shapes and returns a short summary instead.
 *
 * Only Atomiq-specific patterns (Cloudflare tunnel, HTML pages, httpCode
 * extraction) are handled here. Generic timeout/network detection is
 * delegated to {@link SanitizedError.sanitize}.
 */
export function sanitizeAtomiqError(err: unknown): SanitizedError {
  if (!(err instanceof Error)) {
    return {kind: 'unknown', summary: truncate(serializeError(err))};
  }

  const originalName = err.name;
  const httpCode = extractHttpCode(err);
  const rawMessage = err.message;

  if (isHtmlBody(rawMessage)) {
    return sanitizeHtmlError(rawMessage, httpCode, originalName);
  }

  // Delegate generic timeout/network detection to the shared sanitizer
  const base = SanitizedError.sanitize('Atomiq', err);
  return {
    ...base,
    ...(httpCode !== undefined && {httpCode}),
    summary: truncate(base.summary),
    originalName,
  };
}

function sanitizeHtmlError(
  rawMessage: string,
  httpCode: number | undefined,
  originalName: string,
): SanitizedError {
  const httpCodeDetails = httpCode === undefined ? '' : `, HTTP ${httpCode}`;
  const isCloudflare = /cloudflare\s+tunnel\s+error/i.test(rawMessage);
  return {
    kind: isCloudflare ? 'cloudflare_tunnel' : 'html_response',
    ...(httpCode !== undefined && {httpCode}),
    summary: isCloudflare
      ? `Atomiq intermediary unreachable (Cloudflare Tunnel error${httpCodeDetails})`
      : `Atomiq intermediary returned an HTML error page${httpCodeDetails}`,
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
