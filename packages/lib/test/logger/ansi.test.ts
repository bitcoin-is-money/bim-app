import {describe, expect, it} from 'vitest';
import {colorize} from '../../src/logger/ansi';

describe('colorize', () => {
  it('applies foreground color', () => {
    const result = colorize({fg: 38}, 'hello');
    expect(result).toBe('\x1b[38;5;38mhello\x1b[39m');
  });

  it('applies foreground + background color', () => {
    const result = colorize({fg: 15, bg: 16}, 'fatal');
    expect(result).toBe('\x1b[48;5;16m\x1b[38;5;15mfatal\x1b[39m\x1b[49m');
  });

  it('does not add background escape when bg is undefined', () => {
    const result = colorize({fg: 1}, 'text');
    expect(result).not.toContain('\x1b[48;5;');
    expect(result).not.toContain('\x1b[49m');
  });
});
