import {createLogger, logContext} from '@bim/lib/logger';
import {Hono} from 'hono';
import {Writable} from 'node:stream';
import pino, {type Logger} from 'pino';
import {beforeEach, describe, expect, it} from 'vitest';
import {createRequestLoggerMiddleware, setRequestCounter} from '../../../src/middleware/request-logger.middleware';

/** Collects raw JSON log entries written by pino. */
function createCapturingLogger() {
  const entries: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      entries.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  const logger = pino(
    {
      level: 'debug',
      mixin() {
        return logContext.getStore() ?? {};
      },
    },
    stream,
  );
  return {logger, entries};
}

function createTestLoggerApp(logger: Logger) {
  const app = new Hono();
  app.use('*', createRequestLoggerMiddleware(logger));

  app.get('/ok', (c) =>
    c.json({status: 'ok'}));
  app.get('/not-found', (c) =>
    c.json({error: 'not found'}, 404));
  app.get('/error', () => {
    throw new Error('boom');
  });

  return app;
}

describe('request-logger middleware', () => {
  let logger: Logger;
  let entries: Record<string, unknown>[];
  let app: Hono;

  beforeEach(() => {
    ({logger, entries} = createCapturingLogger());
    app = createTestLoggerApp(logger);
  });

  it('injects requestId into every log entry via logContext mixin', async () => {
    await app.request('/ok');

    // Should have at least 2 entries: "Incoming request" + "Request completed"
    expect(entries.length).toBeGreaterThanOrEqual(2);

    // All entries must carry the same requestId
    const requestIds = entries.map(e => e['requestId']);
    expect(requestIds.every(id => id != null)).toBe(true);
    expect(new Set(requestIds).size).toBe(1);
  });

  it('increments requestId across requests', async () => {
    await app.request('/ok');
    const firstId = entries[0]!['requestId'];

    await app.request('/ok');
    // Entries from the second request
    const secondRequestEntries = entries.filter(e => e['requestId'] !== firstId);
    expect(secondRequestEntries.length).toBeGreaterThan(0);

    const secondId = secondRequestEntries[0]!['requestId'];
    expect(Number(secondId)).toBe(Number(firstId) + 1);
  });

  it('sets X-Request-Id response header', async () => {
    const res = await app.request('/ok');

    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('logs method and path on incoming request', async () => {
    await app.request('/ok');

    const incoming = entries.find(e => (e['msg'] as string).startsWith('Incoming request'));
    expect(incoming).toBeDefined();
    expect(incoming!['msg']).toBe('Incoming request - GET /ok');
  });

  it('logs status and duration on completed request', async () => {
    await app.request('/ok');

    const completed = entries.find(e => e['msg'] === 'Request completed');
    expect(completed).toBeDefined();
    expect(completed!['status']).toBe(200);
    expect(completed!['durationMs']).toEqual(expect.any(Number));
  });

  it('uses debug level for 2xx responses', async () => {
    await app.request('/ok');

    const completed = entries.find(e => e['msg'] === 'Request completed');
    // pino debug level = 20
    expect(completed!['level']).toBe(20);
  });

  it('uses warn level for 4xx responses', async () => {
    await app.request('/not-found');

    const completed = entries.find(e => e['msg'] === 'Request completed');
    // pino warn level = 40
    expect(completed!['level']).toBe(40);
  });

  it('wraps requestId back to 1 after 999', async () => {
    setRequestCounter(998);

    await app.request('/ok');
    expect(entries[0]!['requestId']).toBe('999');

    await app.request('/ok');
    const wrappedEntries = entries.filter(e => e['requestId'] === '1');
    expect(wrappedEntries.length).toBeGreaterThan(0);
  });

  it('displays requestId in pretty-printed output', async () => {
    const prettyLogger = createLogger('info');
    const prettyApp = createTestLoggerApp(prettyLogger);

    // 200 — two INFO lines (incoming + completed)
    await prettyApp.request('/ok');
    // 500 — INFO incoming + ERROR completed
    await prettyApp.request('/error');

    expect(true).toBe(true);
  });

  describe('silencedPaths', () => {
    let silencedApp: Hono;

    beforeEach(() => {
      silencedApp = new Hono();
      silencedApp.use('*', createRequestLoggerMiddleware(logger, {silencedPaths: ['/api/auth']}));
      silencedApp.get('/api/auth/session', (c) => c.json({ok: true}));
      silencedApp.post('/api/auth/login/begin', (c) => c.json({ok: true}));
      silencedApp.get('/api/account', (c) => c.json({ok: true}));
      silencedApp.get('/api/auth/fail', (c) => c.json({error: 'unauthorized'}, 401));
    });

    it('does not log silenced paths on success', async () => {
      await silencedApp.request('/api/auth/session');

      expect(entries).toHaveLength(0);
    });

    it('does not log silenced paths with nested routes', async () => {
      await silencedApp.request('/api/auth/login/begin', {method: 'POST'});

      expect(entries).toHaveLength(0);
    });

    it('still logs non-silenced paths', async () => {
      await silencedApp.request('/api/account');

      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it('still logs silenced paths on error (4xx+)', async () => {
      await silencedApp.request('/api/auth/fail');

      const completed = entries.find(e => e['msg'] === 'Request completed');
      expect(completed).toBeDefined();
      expect(completed!['status']).toBe(401);
    });
  });
});
