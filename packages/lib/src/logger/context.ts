import {AsyncLocalStorage} from 'node:async_hooks';

/**
 * Async-scoped log context (Node.js equivalent of logback MDC).
 * Fields stored here are automatically injected into every pino log entry
 * via the `mixin` option.
 *
 * Usage in middleware: `logContext.run({ requestId: '42' }, next)`
 */
export const logContext = new AsyncLocalStorage<Record<string, unknown>>();
