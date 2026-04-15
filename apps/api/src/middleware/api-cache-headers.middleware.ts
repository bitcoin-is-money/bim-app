import type {MiddlewareHandler} from 'hono';

/**
 * Forces `Cache-Control: private, no-store` on every `/api/*` response.
 *
 * API payloads are session-authenticated and user-specific. Without this
 * header the browser is free to apply its heuristic caching (loose rules
 * that trigger when no explicit `Cache-Control` / `Expires` is set), and
 * any CDN or reverse proxy between the client and the API could cache a
 * response across users. Both are unacceptable for authenticated data.
 *
 * Directives:
 *   - `private`  — shared caches (CDN, corporate proxies) must not store.
 *   - `no-store` — no cache at any layer may store, period.
 *
 * Routes that explicitly want to opt into caching can overwrite the
 * header after calling `next()` in their own handler.
 */
export function createApiCacheHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  };
}
