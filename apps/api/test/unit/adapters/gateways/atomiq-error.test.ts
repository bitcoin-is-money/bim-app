import {sanitizeAtomiqError} from '@bim/atomiq';
import {SanitizedError} from '@bim/lib/error';
import {describe, expect, it} from 'vitest';

const CLOUDFLARE_530_HTML = `<!doctype html>
<html lang="en-US">
<head>
  <title>Cloudflare Tunnel error | atomiq-lp.aleksfar.com | Cloudflare</title>
</head>
<body>...</body>
</html>`;

class FakeRequestError extends Error {
  constructor(message: string, readonly httpCode: number) {
    super(message);
    this.name = '_RequestError';
  }
}

describe('sanitizeAtomiqError', () => {
  it('detects a Cloudflare tunnel error page', () => {
    const err = new FakeRequestError(CLOUDFLARE_530_HTML, 530);
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('cloudflare_tunnel');
    expect(result.httpCode).toBe(530);
    expect(result.summary).toContain('Cloudflare Tunnel');
    expect(result.summary).not.toContain('<html');
    expect(result.originalName).toBe('_RequestError');
  });

  it('detects a generic HTML response when no cloudflare marker is present', () => {
    const err = new FakeRequestError('<html><body>500 internal server error</body></html>', 500);
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('html_response');
    expect(result.httpCode).toBe(500);
    expect(result.summary).not.toContain('<html');
  });

  it('classifies timeout errors', () => {
    const err = new Error('Request timed out after 30000ms');
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('timeout');
  });

  it('classifies network errors', () => {
    const err = new Error('fetch failed: ECONNREFUSED');
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('network');
  });

  it('falls back to unknown for plain errors and truncates long messages', () => {
    const long = 'x'.repeat(500);
    const err = new Error(long);
    const result = sanitizeAtomiqError(err);
    expect(result.kind).toBe('unknown');
    expect(result.summary.length).toBeLessThanOrEqual(201);
  });

  it('handles non-Error throwables', () => {
    const result = sanitizeAtomiqError('something bad');
    expect(result.kind).toBe('unknown');
    expect(result.summary).toContain('something bad');
  });
});

describe('SanitizedError.isInfraFailure', () => {
  it('returns true for recognized infrastructure failure kinds', () => {
    expect(SanitizedError.isInfraFailure({kind: 'cloudflare_tunnel', summary: ''})).toBe(true);
    expect(SanitizedError.isInfraFailure({kind: 'html_response', summary: ''})).toBe(true);
    expect(SanitizedError.isInfraFailure({kind: 'network', summary: ''})).toBe(true);
    expect(SanitizedError.isInfraFailure({kind: 'timeout', summary: ''})).toBe(true);
  });

  it('returns false for unknown errors (likely SDK/functional bugs, not outages)', () => {
    expect(SanitizedError.isInfraFailure({kind: 'unknown', summary: ''})).toBe(false);
  });
});
