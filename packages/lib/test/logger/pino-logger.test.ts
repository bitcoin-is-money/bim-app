import {createLogger} from '@bim/lib/logger';
import {describe, expect, it} from 'vitest';

// Visual smoke tests — verify rendering in vitest console output
// Change this log level to trace to see output when launching tests
const LOG_LEVEL = 'silent';

describe('createLogger rendering', () => {
  const log = createLogger(LOG_LEVEL);

  it('with name', () => {
    const named = log.child({name: 'pay.service.ts'});
    expect(() => {
      named.debug({amount: 1000}, 'Payment executed');
      named.info({amount: 1000}, 'Payment executed');
      named.warn({address: '0x123'}, 'Low balance');
      named.error(new Error('Connection failed'), 'Gateway error');
    }).not.toThrow();
  });

  it('trace', () => { expect(() => { log.trace('This is a trace message'); }).not.toThrow(); });
  it('debug', () => { expect(() => { log.debug('This is a debug message'); }).not.toThrow(); });
  it('info', () => { expect(() => { log.info('This is an info message'); }).not.toThrow(); });
  it('warn', () => { expect(() => { log.warn('This is a warn message'); }).not.toThrow(); });
  it('error', () => { expect(() => { log.error('This is an error message'); }).not.toThrow(); });
  it('fatal', () => { expect(() => { log.fatal('This is a fatal message'); }).not.toThrow(); });
  it('info with key', () => { expect(() => { log.info({key: 'value'}, 'This is an info message'); }).not.toThrow(); });
});
