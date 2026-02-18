import {logContext} from '@bim/lib/logger';
import type {Context, Next} from 'hono';
import {basename} from "node:path";
import type {LogFn, Logger} from 'pino';

const MAX_REQUEST_ID = 999;
let requestCounter = 0;

/** @internal Exposed for testing only */
export function setRequestCounter(value: number) {
  requestCounter = value;
}

function getStatusLogFn(
  logger: Logger,
  httpStatus: number
): LogFn {
  if (httpStatus >= 500) return logger.error.bind(logger);
  if (httpStatus >= 400) return logger.warn.bind(logger);
  return logger.debug.bind(logger);
}

/**
 * Creates a Hono middleware that:
 * 1. Generates an incrementing requestId
 * 2. Stores it in the async-scoped logContext (pino mixin picks it up automatically)
 * 3. Logs the request/response (method, path, status, duration)
 */
export function createRequestLoggerMiddleware(
  rootLogger: Logger,
  options?: { apiOnly?: boolean; silencedPaths?: string[] },
) {
  const logger = rootLogger.child({name: basename(import.meta.filename)});
  const apiOnly = options?.apiOnly ?? false;
  const silencedPaths = options?.silencedPaths ?? [];

  return async (ctx: Context, next: Next) => {
    requestCounter = requestCounter >= MAX_REQUEST_ID ? 1 : requestCounter + 1;
    const requestId = String(requestCounter);

    ctx.set('requestId', requestId);
    ctx.header('X-Request-Id', requestId);

    const start = performance.now();
    const {method} = ctx.req;
    const path = ctx.req.path;
    const isApiRoute = path.startsWith('/api');
    const isSilenced = silencedPaths.some(prefix => path.startsWith(prefix));

    await logContext.run({requestId}, async () => {
      if (!isSilenced && (isApiRoute || !apiOnly)) {
        logger.info(`Incoming request - ${method} ${path}`);
      }

      await next();

      const durationMs = Math.round(performance.now() - start);
      const httpStatus = ctx.res.status;

      if (httpStatus >= 400 || (!isSilenced && (isApiRoute || !apiOnly))) {
        const logFn = getStatusLogFn(logger, httpStatus);
        logFn({method, path, status: httpStatus, durationMs}, 'Request completed');
      }
    });
  };
}
