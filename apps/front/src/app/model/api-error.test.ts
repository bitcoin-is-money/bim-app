import { describe, expect, it } from 'vitest';
import { ErrorCode, getErrorCode, getErrorMessage, isApiErrorResponse } from './api-error';

const validApiError = { error: { code: ErrorCode.SWAP_NOT_FOUND, message: 'Swap not found' } };

describe('isApiErrorResponse', () => {
  it('accepts a well-formed API error', () => {
    expect(isApiErrorResponse(validApiError)).toBe(true);
  });

  it('rejects null, undefined, primitives', () => {
    expect(isApiErrorResponse(null)).toBe(false);
    expect(isApiErrorResponse(undefined)).toBe(false);
    expect(isApiErrorResponse('error')).toBe(false);
    expect(isApiErrorResponse(42)).toBe(false);
  });

  it('rejects objects missing required fields', () => {
    expect(isApiErrorResponse({})).toBe(false);
    expect(isApiErrorResponse({ error: 'string' })).toBe(false);
    expect(isApiErrorResponse({ error: { code: 'X' } })).toBe(false);
    expect(isApiErrorResponse({ error: { message: 'X' } })).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('returns API error message when input is an ApiErrorResponse', () => {
    expect(getErrorMessage(validApiError)).toBe('Swap not found');
  });

  it('returns plain Error.message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns fallback for unknown shapes', () => {
    expect(getErrorMessage(null)).toBe('An error occurred');
    expect(getErrorMessage('not an error')).toBe('An error occurred');
    expect(getErrorMessage(undefined, 'custom fallback')).toBe('custom fallback');
  });
});

describe('getErrorCode', () => {
  it('returns the code from an ApiErrorResponse', () => {
    expect(getErrorCode(validApiError)).toBe(ErrorCode.SWAP_NOT_FOUND);
  });

  it('returns undefined for non-API errors', () => {
    expect(getErrorCode(new Error('boom'))).toBeUndefined();
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode({})).toBeUndefined();
  });
});
