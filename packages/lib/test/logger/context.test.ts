import {describe, expect, it} from 'vitest';
import {logContext} from '../../src/logger/context';

describe('logContext', () => {
  it('returns undefined outside of run()', () => {
    expect(logContext.getStore()).toBeUndefined();
  });

  it('returns the store inside run()', () => {
    logContext.run({requestId: '42'}, () => {
      expect(logContext.getStore()).toEqual({requestId: '42'});
    });
  });

  it('supports nested contexts', () => {
    logContext.run({requestId: '1'}, () => {
      expect(logContext.getStore()).toEqual({requestId: '1'});

      logContext.run({requestId: '2'}, () => {
        expect(logContext.getStore()).toEqual({requestId: '2'});
      });

      expect(logContext.getStore()).toEqual({requestId: '1'});
    });
  });
});
