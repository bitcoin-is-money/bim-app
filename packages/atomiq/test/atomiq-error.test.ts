import {describe, expect, it} from 'vitest';
import {isInfraFailure, sanitizeAtomiqError} from '../src';

describe('sanitizeAtomiqError', () => {
  it('handles non-Error inputs (strings, null, undefined)', () => {
    expect(sanitizeAtomiqError('boom').kind).toBe('unknown');
    expect(sanitizeAtomiqError('boom').summary).toBe('boom');
    expect(sanitizeAtomiqError(null).kind).toBe('unknown');
    expect(sanitizeAtomiqError(undefined).kind).toBe('unknown');
  });

  it('detects Cloudflare Tunnel HTML error page', () => {
    const html = '<!DOCTYPE html><html>... Cloudflare Tunnel error ...</html>';
    const err = new Error(html);
    (err as unknown as {httpCode: number}).httpCode = 530;

    const result = sanitizeAtomiqError(err);

    expect(result.kind).toBe('cloudflare_tunnel');
    expect(result.httpCode).toBe(530);
    expect(result.summary).toContain('Cloudflare Tunnel');
  });

  it('detects generic HTML error pages (non-Cloudflare)', () => {
    const err = new Error('<html><body><h1>502 Bad Gateway</h1></body></html>');
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('html_response');
    expect(result.summary).toContain('HTML error page');
  });

  it('detects timeouts', () => {
    const err = new Error('Operation timed out after 30s');
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('timeout');
  });

  it('detects network errors', () => {
    expect(sanitizeAtomiqError(new Error('ECONNRESET')).kind).toBe('network');
    expect(sanitizeAtomiqError(new Error('ENOTFOUND api.example.com')).kind).toBe('network');
    expect(sanitizeAtomiqError(new Error('fetch failed')).kind).toBe('network');
  });

  it('classifies unrecognized Error shapes as unknown', () => {
    const err = new Error('some business logic error');
    err.name = 'BusinessError';
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('unknown');
    expect(result.summary).toBe('some business logic error');
    expect(result.originalName).toBe('BusinessError');
  });

  it('truncates very long messages', () => {
    const longMessage = 'x'.repeat(500);
    const result = sanitizeAtomiqError(new Error(longMessage));
    expect(result.summary.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    expect(result.summary.endsWith('…')).toBe(true);
  });

  it('collapses whitespace in summaries', () => {
    const result = sanitizeAtomiqError(new Error('line1\n\n  line2\t\ttabbed'));
    expect(result.summary).toBe('line1 line2 tabbed');
  });

  it('preserves httpCode when provided', () => {
    const err = new Error('fetch failed');
    (err as unknown as {httpCode: number}).httpCode = 502;
    expect(sanitizeAtomiqError(err).httpCode).toBe(502);
  });

  it('ignores invalid httpCode values', () => {
    const err = new Error('fetch failed');
    (err as unknown as {httpCode: string}).httpCode = 'not-a-number';
    expect(sanitizeAtomiqError(err).httpCode).toBeUndefined();
  });
});

describe('isInfraFailure', () => {
  it('returns true for infra failure kinds', () => {
    expect(isInfraFailure({kind: 'cloudflare_tunnel', summary: 'x'})).toBe(true);
    expect(isInfraFailure({kind: 'html_response', summary: 'x'})).toBe(true);
    expect(isInfraFailure({kind: 'network', summary: 'x'})).toBe(true);
    expect(isInfraFailure({kind: 'timeout', summary: 'x'})).toBe(true);
  });

  it('returns false for non-infra kinds', () => {
    expect(isInfraFailure({kind: 'unknown', summary: 'x'})).toBe(false);
  });
});
