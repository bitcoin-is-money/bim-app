import {createLogger, isValidLevel} from '@bim/lib/logger';
import {describe, expect, it} from 'vitest';

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
