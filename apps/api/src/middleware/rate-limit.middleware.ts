import type {Context} from 'hono';
import {rateLimiter} from 'hono-rate-limiter';

import type {ApiErrorResponse} from '../errors/api-error';
import {ErrorCode} from '../errors/error-codes';

function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
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

/** 5 requests per minute per IP — auth endpoints (anti brute-force). */
export function createAuthRateLimit() {
  return rateLimiter({
    windowMs: 60 * 1000,
    limit: 5,
    keyGenerator: getClientIp,
    handler: (c) => rateLimitedResponse(c, 'Too many authentication attempts. Please try again later.'),
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
