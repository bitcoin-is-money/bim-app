import type {MiddlewareHandler} from 'hono';

/**
 * Files that must never be cached by the browser or intermediate proxies.
 * Keeping these fresh is critical for the PWA update flow:
 *   - ngsw-worker.js / ngsw.json drive version detection; a stale copy
 *     would strand users on an old release forever.
 *   - manifest.webmanifest changes invalidate install metadata.
 *   - index.html is the SPA entry point; a stale copy can reference
 *     deleted hashed bundles.
 */
const NO_CACHE_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/index.html',
  '/ngsw-worker.js',
  '/ngsw.json',
  '/safety-worker.js',
  '/worker-basic.min.js',
  '/manifest.webmanifest',
  '/version.json',
]);

/**
 * Forces Cache-Control: no-cache on the handful of files that drive PWA
 * updates and the SPA entry point. All other static assets retain their
 * default caching (they are hash-named and immutable by Angular's build).
 *
 * Any request whose path is not in NO_CACHE_PATHS passes through
 * untouched, so the static serving layer remains in full control of
 * hashed asset caching.
 */
export function createPwaCacheHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (NO_CACHE_PATHS.has(c.req.path)) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
    }
  };
}
