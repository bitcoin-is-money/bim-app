import {redactUrl} from '@bim/lib/url';
import {describe, expect, it} from 'vitest';

describe('redactUrl', () => {
  it('redacts password from postgresql URL', () => {
    expect(redactUrl('postgresql://user:s3cret@localhost:5432/bim'))
      .toBe('postgresql://user:***@localhost:5432/bim');
  });

  it('redacts password from https URL', () => {
    expect(redactUrl('https://admin:p4ss@api.example.com/v1'))
      .toBe('https://admin:***@api.example.com/v1');
  });

  it('leaves URL unchanged when there is no password', () => {
    expect(redactUrl('postgresql://localhost:5432/bim'))
      .toBe('postgresql://localhost:5432/bim');
  });

  it('leaves URL unchanged when there is a user but no password', () => {
    expect(redactUrl('postgresql://user@localhost:5432/bim'))
      .toBe('postgresql://user@localhost:5432/bim');
  });

  it('preserves query parameters', () => {
    expect(redactUrl('postgresql://user:secret@host/db?sslmode=require'))
      .toBe('postgresql://user:***@host/db?sslmode=require');
  });

  it('returns *** for invalid URL', () => {
    expect(redactUrl('not-a-url')).toBe('***');
  });

  it('returns *** for empty string', () => {
    expect(redactUrl('')).toBe('***');
  });
});
