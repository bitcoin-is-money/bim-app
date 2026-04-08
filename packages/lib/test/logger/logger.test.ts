import {Writable} from 'node:stream';
import {createLogger, isValidLevel} from '@bim/lib/logger';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

function createMemoryStream(): {stream: Writable; read: () => string} {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  return {
    stream,
    read: () => Buffer.concat(chunks).toString('utf8'),
  };
}

// Strips ANSI color codes so regex assertions match the raw text.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
function stripAnsi(value: string): string {
  return value.replaceAll(ANSI_PATTERN, '');
}

const TIMESTAMP_PATTERN = /\d{2}:\d{2}:\d{2}\.\d{3}/;

describe('isValidLevel', () => {
  it.each(['debug', 'info', 'warn', 'error', 'silent'])('accepts "%s"', (level) => {
    expect(isValidLevel(level)).toBe(true);
  });

  it.each(['trace', 'fatal', 'verbose', '', 'INFO'])('rejects "%s"', (level) => {
    expect(isValidLevel(level)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidLevel(undefined)).toBe(false);
  });
});

describe('createLogger', () => {
  it('returns a pino Logger', () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('defaults to info level', () => {
    const logger = createLogger();
    expect(logger.level).toBe('info');
  });

  it('respects the level parameter', () => {
    const logger = createLogger('debug');
    expect(logger.level).toBe('debug');
  });

  it('reads LOG_LEVEL env var when no level is passed', () => {
    const original = process.env.LOG_LEVEL;
    try {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger();
      expect(logger.level).toBe('warn');
    } finally {
      if (original === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = original;
    }
  });
});

describe('createLogger timestamp rendering', () => {
  const originalLogTimestamp = process.env.LOG_TIMESTAMP;

  beforeEach(() => {
    delete process.env.LOG_TIMESTAMP;
  });

  afterEach(() => {
    if (originalLogTimestamp === undefined) delete process.env.LOG_TIMESTAMP;
    else process.env.LOG_TIMESTAMP = originalLogTimestamp;
  });

  it('renders a timestamp by default', () => {
    const {stream, read} = createMemoryStream();
    const logger = createLogger('info', undefined, stream);
    logger.info('hello');
    const output = stripAnsi(read());
    expect(output).toMatch(TIMESTAMP_PATTERN);
    expect(output).toContain('hello');
  });

  it('renders a timestamp when LOG_TIMESTAMP=true', () => {
    process.env.LOG_TIMESTAMP = 'true';
    const {stream, read} = createMemoryStream();
    const logger = createLogger('info', undefined, stream);
    logger.info('hello');
    expect(stripAnsi(read())).toMatch(TIMESTAMP_PATTERN);
  });

  it('omits the timestamp when LOG_TIMESTAMP=false', () => {
    process.env.LOG_TIMESTAMP = 'false';
    const {stream, read} = createMemoryStream();
    const logger = createLogger('info', undefined, stream);
    logger.info('hello');
    const output = stripAnsi(read());
    expect(output).not.toMatch(TIMESTAMP_PATTERN);
    expect(output).toContain('hello');
  });
});
