import {SanitizedError} from '@bim/lib/error';
import {describe, expect, it} from 'vitest';

describe('SanitizedError.sanitize', () => {
  it('detects timeout errors', () => {
    const result = SanitizedError.sanitize('TestService', new Error('Request timed out'));
    expect(result.kind).toBe('timeout');
    expect(result.summary).toBe('TestService timeout: Request timed out');
  });

  it('detects "timeout" keyword', () => {
    expect(SanitizedError.sanitize('S', new Error('timeout after 5s')).kind).toBe('timeout');
  });

  it('detects "aborted" keyword', () => {
    expect(SanitizedError.sanitize('S', new Error('Request aborted')).kind).toBe('timeout');
  });

  it('detects network errors with "fetch" keyword', () => {
    const result = SanitizedError.sanitize('TestService', new Error('fetch failed'));
    expect(result.kind).toBe('network');
    expect(result.summary).toBe('TestService unreachable: fetch failed');
  });

  it('detects ECONNREFUSED', () => {
    expect(SanitizedError.sanitize('S', new Error('ECONNREFUSED 127.0.0.1:5432')).kind).toBe('network');
  });

  it('detects ECONNRESET', () => {
    expect(SanitizedError.sanitize('S', new Error('ECONNRESET')).kind).toBe('network');
  });

  it('detects ENOTFOUND', () => {
    expect(SanitizedError.sanitize('S', new Error('ENOTFOUND api.example.com')).kind).toBe('network');
  });

  it('detects socket errors', () => {
    expect(SanitizedError.sanitize('S', new Error('socket hang up')).kind).toBe('network');
  });

  it('falls back to unknown for unrecognized errors', () => {
    const result = SanitizedError.sanitize('TestService', new Error('something else'));
    expect(result.kind).toBe('unknown');
    expect(result.summary).toBe('TestService error: something else');
  });

  it('handles non-Error inputs via serializeError', () => {
    const result = SanitizedError.sanitize('S', 'plain string error');
    expect(result.kind).toBe('unknown');
    expect(result.summary).toBe('S error: plain string error');
  });

  it('handles null input', () => {
    const result = SanitizedError.sanitize('S', null);
    expect(result.kind).toBe('unknown');
    expect(result.summary).toBe('S error: null');
  });

  it('handles object input', () => {
    const result = SanitizedError.sanitize('S', {code: 500});
    expect(result.kind).toBe('unknown');
    expect(result.summary).toBe('S error: {"code":500}');
  });

  it('is case-insensitive for keyword matching', () => {
    expect(SanitizedError.sanitize('S', new Error('TIMEOUT')).kind).toBe('timeout');
    expect(SanitizedError.sanitize('S', new Error('Network Error')).kind).toBe('network');
  });

  it('timeout takes priority over network when both match', () => {
    const result = SanitizedError.sanitize('S', new Error('network timeout'));
    expect(result.kind).toBe('timeout');
  });
});

describe('SanitizedError.isInfraFailure', () => {
  it('returns true for cloudflare_tunnel', () => {
    expect(SanitizedError.isInfraFailure({kind: 'cloudflare_tunnel', summary: ''})).toBe(true);
  });

  it('returns true for html_response', () => {
    expect(SanitizedError.isInfraFailure({kind: 'html_response', summary: ''})).toBe(true);
  });

  it('returns true for network', () => {
    expect(SanitizedError.isInfraFailure({kind: 'network', summary: ''})).toBe(true);
  });

  it('returns true for timeout', () => {
    expect(SanitizedError.isInfraFailure({kind: 'timeout', summary: ''})).toBe(true);
  });

  it('returns false for unknown', () => {
    expect(SanitizedError.isInfraFailure({kind: 'unknown', summary: ''})).toBe(false);
  });

  it('returns false for credits', () => {
    expect(SanitizedError.isInfraFailure({kind: 'credits', summary: ''})).toBe(false);
  });
});
