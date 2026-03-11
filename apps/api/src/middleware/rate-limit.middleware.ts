import {getConnInfo} from '@hono/node-server/conninfo';
import type {Context} from 'hono';
import {rateLimiter} from 'hono-rate-limiter';

import type {ApiErrorResponse} from '../errors';
import {ErrorCode} from '../errors';

function getClientIp(c: Context): string {
  // Use real socket IP only (not spoofable).
  // X-Forwarded-For is client-controlled and must NOT be used as a rate limit key,
  // otherwise an attacker can bypass all limits by rotating the header value.
  try {
    const info = getConnInfo(c);
    if (info.remote.address) return info.remote.address;
  } catch {
    // getConnInfo unavailable (e.g. app.request() in tests)
  }
  return 'unknown';
}

function rateLimitedResponse(c: Context, message: string) {
  return c.json({error: {code: ErrorCode.RATE_LIMITED, message}} satisfies ApiErrorResponse, 429);
}

/** 100 requests per 15 minutes per IP — applied to all /api/* routes. */
export function createGlobalRateLimit() {
  return rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    keyGenerator: getClientIp,
    handler: (c) => rateLimitedResponse(c, 'Too many requests. Please try again later.'),
  });
}

/** 10 requests per minute per IP — auth endpoints (anti brute-force). */
export function createAuthRateLimit() {
  return rateLimiter({
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: getClientIp,
    handler: (c) => rateLimitedResponse(c, 'Too many authentication attempts. Please try again later.'),
  });
}

/** 30 requests per minute per IP — payment operations (parse, build, receive). */
export function createPaymentRateLimit() {
  return rateLimiter({
    windowMs: 60 * 1000,
    limit: 30,
    keyGenerator: getClientIp,
    handler: (c) => rateLimitedResponse(c, 'Too many payment requests. Please try again later.'),
  });
}

/** 10 requests per 5 minutes per IP — payment execution (financial protection). */
export function createPaymentExecuteRateLimit() {
  return rateLimiter({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    keyGenerator: getClientIp,
    handler: (c) => rateLimitedResponse(c, 'Too many payment requests. Please try again later.'),
  });
}
