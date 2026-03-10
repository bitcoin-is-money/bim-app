import type {MiddlewareHandler} from 'hono';

/**
 * Adds defense-in-depth security headers to every response.
 *
 * - X-Content-Type-Options: prevents MIME type sniffing
 * - X-Frame-Options: prevents clickjacking
 * - Referrer-Policy: limits referrer leakage on cross-origin navigation
 * - Permissions-Policy: disables sensitive browser APIs not used by the app
 * - Strict-Transport-Security: enforces HTTPS for 1 year
 */
export function createSecurityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  };
}
