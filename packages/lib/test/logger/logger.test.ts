import {describe, expect, it} from 'vitest';
import {createLogger, isValidLevel} from '../../src/logger';

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

  it('defaults to silent level', () => {
    const logger = createLogger();
    expect(logger.level).toBe('silent');
  });

  it('respects the level parameter', () => {
    const logger = createLogger('debug');
    expect(logger.level).toBe('debug');
  });
});
