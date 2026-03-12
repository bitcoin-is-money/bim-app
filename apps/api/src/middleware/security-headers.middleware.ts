import type {MiddlewareHandler} from 'hono';

/**
 * Adds defense-in-depth security headers to every response.
 *
 * - Content-Security-Policy: restricts resource loading to prevent XSS
 * - X-Content-Type-Options: prevents MIME type sniffing
 * - X-Frame-Options: prevents clickjacking
 * - Referrer-Policy: limits referrer leakage on cross-origin navigation
 * - Permissions-Policy: disables sensitive browser APIs not used by the app
 * - Strict-Transport-Security: enforces HTTPS for 1 year
 */
export function createSecurityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  };
}
