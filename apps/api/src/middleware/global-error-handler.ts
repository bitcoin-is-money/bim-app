import type {Hono} from 'hono';

/**
 * Installs a global error handler on the Hono app.
 *
 * Catches any unhandled error that escapes route try/catch blocks
 * or middleware, and returns a sanitized 500 response.
 * Prevents leaking stack traces, internal paths, or error messages.
 */
export function installGlobalErrorHandler(app: Hono): void {
  app.onError((_error, c) => {
    return c.json(
      {error: {code: 'INTERNAL_ERROR', message: 'Internal server error'}},
      500,
    );
  });
}
