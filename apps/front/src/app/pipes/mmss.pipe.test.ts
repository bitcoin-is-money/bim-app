import {describe, expect, it} from 'vitest';
import {MmssPipe} from './mmss.pipe';

describe('MmssPipe', () => {
  const pipe = new MmssPipe();

  it('formats under a minute', () => {
    expect(pipe.transform(45)).toBe('0:45');
  });

  it('pads seconds', () => {
    expect(pipe.transform(65)).toBe('1:05');
  });

  it('handles multi-minute durations', () => {
    expect(pipe.transform(3599)).toBe('59:59');
  });

  it('returns 0:00 for undefined', () => {
    expect(pipe.transform(undefined)).toBe('0:00');
  });

  it('returns 0:00 for negative', () => {
    expect(pipe.transform(-5)).toBe('0:00');
  });
});
