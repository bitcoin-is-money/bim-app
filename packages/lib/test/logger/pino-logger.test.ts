import {createLogger} from '@bim/lib/logger';
import {describe, it} from 'vitest';

// Visual smoke tests — verify rendering in vitest console output
// Change this log level to trace to see output when launching tests
const LOG_LEVEL = 'silent';

describe('createLogger rendering', () => {
  const log = createLogger(LOG_LEVEL);

  it('with name', () => {
    const named = log.child({name: 'pay.service.ts'});
    named.debug({amount: 1000}, 'Payment executed');
    named.info({amount: 1000}, 'Payment executed');
    named.warn({address: '0x123'}, 'Low balance');
    named.error(new Error('Connection failed'), 'Gateway error');
  });

  it('trace', () => { log.trace('This is a trace message'); });
  it('debug', () => { log.debug('This is a debug message'); });
  it('info', () => { log.info('This is an info message'); });
  it('warn', () => { log.warn('This is a warn message'); });
  it('error', () => { log.error('This is an error message'); });
  it('fatal', () => { log.fatal('This is a fatal message'); });
  it('info with key', () => { log.info({key: 'value'}, 'This is an info message'); });
});
