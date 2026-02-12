import {logContext} from '@bim/lib/logger';
import type {Context, Next} from 'hono';
import type {LogFn, Logger} from 'pino';

const MAX_REQUEST_ID = 999;
let requestCounter = 0;

/** @internal Exposed for testing only */
export function setRequestCounter(value: number) {
  requestCounter = value;
}

function getStatusLogFn(
  rootLogger: Logger,
  httpStatus: number
): LogFn {
  if (httpStatus >= 500) return rootLogger.error.bind(rootLogger);
  if (httpStatus >= 400) return rootLogger.warn.bind(rootLogger);
  return rootLogger.info.bind(rootLogger);
}

/**
 * Creates a Hono middleware that:
 * 1. Generates an incrementing requestId
 * 2. Stores it in the async-scoped logContext (pino mixin picks it up automatically)
 * 3. Logs the request/response (method, path, status, duration)
 */
export function createRequestLoggerMiddleware(rootLogger: Logger) {
  return async (ctx: Context, next: Next) => {
    requestCounter = requestCounter >= MAX_REQUEST_ID ? 1 : requestCounter + 1;
    const requestId = String(requestCounter);

    ctx.set('requestId', requestId);
    ctx.header('X-Request-Id', requestId);

    const start = performance.now();
    const {method} = ctx.req;
    const path = ctx.req.path;

    await logContext.run({requestId}, async () => {
      rootLogger.info({method, path}, 'Incoming request');

      await next();

      const durationMs = Math.round(performance.now() - start);
      const httpStatus = ctx.res.status;
      const logFn = getStatusLogFn(rootLogger, httpStatus);

      logFn({method, path, status: httpStatus, durationMs}, 'Request completed');
    });
  };
}
