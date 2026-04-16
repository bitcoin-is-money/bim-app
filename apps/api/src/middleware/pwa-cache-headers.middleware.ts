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
 * Files that change rarely and whose frequent refetch would otherwise
 * keep the serverless container warm. Chromium internally re-requests
 * robots.txt and sitemap.xml on a short cycle; without an explicit
 * Cache-Control, the browser re-validates them repeatedly.
 */
const LONG_CACHE_PATHS: ReadonlySet<string> = new Set([
  '/robots.txt',
  '/sitemap.xml',
]);

// 10 days in seconds
const LONG_CACHE_MAX_AGE_SECONDS = 10 * 24 * 60 * 60;

/**
 * Sets explicit Cache-Control headers for PWA-critical files (no-cache)
 * and for rarely-changing discoverability files (long public cache).
 * Any request whose path falls outside both sets passes through
 * untouched, so the static serving layer remains in full control of
 * hashed asset caching.
 */
export function createPwaCacheHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const {path} = c.req;
    if (NO_CACHE_PATHS.has(path)) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
    } else if (LONG_CACHE_PATHS.has(path)) {
      c.header('Cache-Control', `public, max-age=${LONG_CACHE_MAX_AGE_SECONDS}`);
    }
  };
}
