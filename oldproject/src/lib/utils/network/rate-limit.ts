import { error } from '@sveltejs/kit';
import { logSecurityEvent } from '$lib/utils/security';

interface RateLimitEntry {
	count: number;
	resetTime: number;
	lastRequest: number;
	blocked: boolean;
}

interface RateLimitStore {
	[key: string]: RateLimitEntry;
}

interface RateLimitConfig {
	maxRequests: number;
	windowMs: number;
	blockDuration?: number; // How long to block after exceeding limit
	skipSuccessfulRequests?: boolean;
	skipFailedRequests?: boolean;
}

interface RateLimitResult {
	remaining: number;
	resetTime: number;
	blocked: boolean;
	retryAfter?: number;
}

const rateLimitStore: RateLimitStore = {};

// Cleanup old entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	Object.keys(rateLimitStore).forEach((key) => {
		const entry = rateLimitStore[key];
		if (entry && now > entry.resetTime && !entry.blocked) {
			delete rateLimitStore[key];
		}
	});
}, 300000);

export function rateLimit(
	identifier: string,
	config: RateLimitConfig | number = 10,
	windowMs: number = 60000 // 1 minute - for backward compatibility
): RateLimitResult {
	// Handle backward compatibility
	const rateLimitConfig: RateLimitConfig =
		typeof config === 'number' ? { maxRequests: config, windowMs } : config;

	const {
		maxRequests,
		windowMs: window,
		blockDuration = window * 2 // Block for 2x the window by default
	} = rateLimitConfig;

	const now = Date.now();
	const key = identifier;

	// Get or create entry
	let entry = rateLimitStore[key];

	// Check if currently blocked
	if (entry?.blocked && now < entry.resetTime) {
		const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

		logSecurityEvent(
			'rate_limit_exceeded',
			{
				identifier,
				currentCount: entry.count,
				maxRequests,
				window,
				blocked: true,
				retryAfter
			},
			'high'
		);

		throw error(
			429,
			`Rate limit exceeded - temporarily blocked. Retry after ${retryAfter} seconds.`
		);
	}

	// Reset if window expired or if blocked period expired
	if (!entry || now > entry.resetTime) {
		entry = {
			count: 0,
			resetTime: now + window,
			lastRequest: now,
			blocked: false
		};
		rateLimitStore[key] = entry;
	}

	// Increment counter
	entry.count++;
	entry.lastRequest = now;

	// Check if limit exceeded
	if (entry.count > maxRequests) {
		// Block the identifier
		entry.blocked = true;
		entry.resetTime = now + blockDuration;

		const retryAfter = Math.ceil(blockDuration / 1000);

		logSecurityEvent(
			'rate_limit_exceeded',
			{
				identifier,
				currentCount: entry.count,
				maxRequests,
				window,
				blocked: true,
				retryAfter,
				blockDuration
			},
			'high'
		);

		throw error(429, `Too many requests - blocked. Retry after ${retryAfter} seconds.`);
	}

	return {
		remaining: maxRequests - entry.count,
		resetTime: entry.resetTime,
		blocked: false
	};
}

/**
 * Advanced rate limiting with multiple tiers
 */
export function advancedRateLimit(
	identifier: string,
	configs: Array<{ requests: number; window: number; label: string }>
): RateLimitResult {
	let result: RateLimitResult = {
		remaining: Infinity,
		resetTime: 0,
		blocked: false
	};

	// Apply all rate limit tiers
	for (const config of configs) {
		const tierKey = `${identifier}:${config.label}`;
		const tierResult = rateLimit(tierKey, {
			maxRequests: config.requests,
			windowMs: config.window
		});

		// Use the most restrictive limit
		if (tierResult.remaining < result.remaining) {
			result = tierResult;
		}
	}

	return result;
}

/**
 * IP-based rate limiting with progressive penalties
 */
export function ipRateLimit(ip: string, path: string, userAgent?: string): RateLimitResult {
	// Different limits for different types of requests
	const configs = [
		{ requests: 1000, window: 3600000, label: 'hourly' }, // 1000 per hour
		{ requests: 100, window: 60000, label: 'minute' }, // 100 per minute
		{ requests: 10, window: 1000, label: 'second' } // 10 per second
	];

	const identifier = `ip:${ip}:${path}`;

	try {
		return advancedRateLimit(identifier, configs);
	} catch (error: any) {
		// Log additional context for IP-based rate limiting
		logSecurityEvent(
			'rate_limit_exceeded',
			{
				type: 'ip_based',
				ip,
				path,
				userAgent: userAgent || 'unknown'
			},
			'high'
		);

		throw error;
	}
}

/**
 * User-based rate limiting for authenticated requests
 */
export function userRateLimit(
	userId: string,
	path: string,
	tier: 'basic' | 'premium' | 'admin' = 'basic'
): RateLimitResult {
	const limits = {
		basic: [
			{ requests: 500, window: 3600000, label: 'hourly' },
			{ requests: 50, window: 60000, label: 'minute' }
		],
		premium: [
			{ requests: 2000, window: 3600000, label: 'hourly' },
			{ requests: 200, window: 60000, label: 'minute' }
		],
		admin: [
			{ requests: 10000, window: 3600000, label: 'hourly' },
			{ requests: 1000, window: 60000, label: 'minute' }
		]
	};

	const identifier = `user:${userId}:${path}`;
	return advancedRateLimit(identifier, limits[tier]);
}

/**
 * Endpoint-specific rate limiting
 */
export function endpointRateLimit(
	identifier: string,
	endpointType: 'auth' | 'financial' | 'webauthn' | 'api' | 'read' | 'rpc'
): RateLimitResult {
	const configs = {
		auth: { maxRequests: 5, windowMs: 60000, blockDuration: 300000 }, // 5 per minute, block for 5 minutes
		financial: { maxRequests: 10, windowMs: 300000, blockDuration: 900000 }, // 10 per 5 minutes, block for 15 minutes
		webauthn: { maxRequests: 5, windowMs: 60000, blockDuration: 300000 }, // align with auth: 5/min, block 5m
		api: { maxRequests: 100, windowMs: 60000, blockDuration: 60000 }, // 100 per minute, block for 1 minute
		rpc: { maxRequests: 60, windowMs: 60000, blockDuration: 120000 }, // stricter: 60 per minute, block for 2 minutes
		read: { maxRequests: 200, windowMs: 60000, blockDuration: 30000 } // 200 per minute, block for 30 seconds
	};

	return rateLimit(`endpoint:${identifier}:${endpointType}`, configs[endpointType]);
}
