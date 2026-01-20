/**
 * @fileoverview Security Utilities and Headers Configuration
 *
 * Comprehensive security utilities for WebAuthn Starknet application including:
 * - Content Security Policy (CSP) configuration
 * - Security headers management
 * - Input sanitization and validation
 * - Security event logging
 *
 * @author bim
 * @version 1.0.0
 */

import { browser } from '$app/environment';
import { PublicEnv } from '$lib/config/env';
import { SECURITY } from '$lib/constants/config.constants';

// Helper to safely get NODE_ENV
function getNodeEnv(): string {
	if (browser) {
		return 'production'; // Default for client-side
	}
	// Server-side - use process.env directly
	return process.env.NODE_ENV || 'development';
}

/**
 * Content Security Policy configuration for WebAuthn and crypto operations
 *
 * This CSP is specifically designed to support:
 * - WebAuthn/WebCrypto APIs
 * - Starknet RPC calls
 * - Lightning Network operations
 * - Safe inline scripts for crypto operations
 */
export function generateCSP(_nonce?: string): string {
	const isDevelopment = getNodeEnv() === 'development';

	// Base CSP directives
	const directives = [
		// Default source - only allow same origin
		"default-src 'self'",

		// Script sources - allow self and inline scripts (SvelteKit requirement)
		"script-src 'self' 'unsafe-inline' 'unsafe-eval'",

		// Style sources - allow self, inline styles, and Google Fonts
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

		// Image sources - allow self, data URIs for QR codes, and trusted external sources
		"img-src 'self' data: blob: https://c.1password.com",

		// Font sources - allow self and Google Fonts
		"font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",

		// Connect sources - allow self and external APIs
		`connect-src 'self' ${getExternalAPIOrigins().join(' ')}`,

		// Frame sources - deny all frames for clickjacking protection
		"frame-src 'none'",

		// Object sources - deny all objects
		"object-src 'none'",

		// Media sources - allow self
		"media-src 'self'",

		// Worker sources - allow self for service workers
		"worker-src 'self' blob:",

		// Manifest sources - allow self
		"manifest-src 'self'",

		// Form action - only allow same origin
		"form-action 'self'",

		// Base URI - restrict to self
		"base-uri 'self'",

		// Upgrade insecure requests in production
		...(isDevelopment ? [] : ['upgrade-insecure-requests'])
	];

	return directives.join('; ');
}

/**
 * Get list of external API origins that need to be whitelisted
 */
function getExternalAPIOrigins(): string[] {
	const origins = [];

	// Add common Starknet endpoints (use public endpoints for CSP)
	// Note: We use common public endpoints instead of the private RPC URL for CSP
	origins.push(
		'https://starknet-mainnet.public.blastapi.io',
		'https://starknet-mainnet.blastapi.io',
		'https://starknet-sepolia.public.blastapi.io',
		'https://starknet-sepolia.blastapi.io',
		'https://starknet-mainnet.g.alchemy.com'
	);

	// Add CoinGecko API for price data
	origins.push('https://api.coingecko.com');

	// Add AVNU paymaster API for gasless transactions
	if (PublicEnv.AVNU_API_URL()) {
		try {
			const url = new URL(PublicEnv.AVNU_API_URL());
			origins.push(url.origin);
		} catch (e) {
			console.warn('Invalid AVNU_API_URL:', PublicEnv.AVNU_API_URL());
		}
	}

	return origins;
}

/**
 * Generate nonce for CSP script-src
 */
export function generateNonce(): string {
	// Use crypto.randomUUID() directly and convert to base64 without Buffer
	const uuid = crypto.randomUUID();
	// Convert UUID string to base64 using browser-compatible method
	return btoa(uuid);
}

/**
 * Complete security headers configuration
 */
export interface SecurityHeaders {
	'Content-Security-Policy'?: string;
	'Strict-Transport-Security'?: string;
	'X-Content-Type-Options': string;
	'X-Frame-Options': string;
	'X-XSS-Protection': string;
	'Referrer-Policy': string;
	'Permissions-Policy': string;
	'Cross-Origin-Embedder-Policy'?: string;
	'Cross-Origin-Opener-Policy'?: string;
	'Cross-Origin-Resource-Policy'?: string;
}

/**
 * Get comprehensive security headers
 */
export function getSecurityHeaders(
	options: {
		csp?: boolean;
		nonce?: string;
		includeHSTS?: boolean;
		allowCamera?: boolean;
	} = {}
): SecurityHeaders {
	const { csp = true, nonce, includeHSTS = getNodeEnv() === 'production' } = options;

	const headers: SecurityHeaders = {
		// Content Security Policy
		...(csp && { 'Content-Security-Policy': generateCSP(nonce) }),

		// HTTP Strict Transport Security (HTTPS only)
		...(includeHSTS && {
			'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
		}),

		// Prevent MIME type sniffing
		'X-Content-Type-Options': 'nosniff',

		// Prevent clickjacking
		'X-Frame-Options': SECURITY.FRAME_OPTIONS,

		// XSS Protection
		'X-XSS-Protection': SECURITY.XSS_PROTECTION ? '1; mode=block' : '0',

		// Referrer Policy
		'Referrer-Policy': 'strict-origin-when-cross-origin',

		// Permissions Policy - restrict access to sensitive APIs
		'Permissions-Policy': [
			'geolocation=()',
			'microphone=()',
			`camera=${options.allowCamera ? '(self)' : '()'}`,
			'publickey-credentials-get=(self)',
			'payment=(self)',
			'usb=()',
			'bluetooth=()',
			'magnetometer=()',
			'accelerometer=()',
			'gyroscope=()'
		].join(', '),

		// Cross-Origin headers for additional isolation
		'Cross-Origin-Embedder-Policy': 'credentialless',
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Resource-Policy': 'same-origin'
	};

	return headers;
}

/**
 * Input sanitization utilities
 */
export const sanitize = {
	/**
	 * Remove HTML tags and dangerous characters
	 */
	html(input: string): string {
		return input
			.replace(/<[^>]*>/g, '') // Remove HTML tags
			.replace(/[<>'"&]/g, (match) => {
				// Escape dangerous chars
				const escapes: Record<string, string> = {
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#x27;',
					'&': '&amp;'
				};
				return escapes[match] || match;
			})
			.trim();
	},

	/**
	 * Sanitize for use in SQL-like contexts
	 */
	sql(input: string): string {
		return input
			.replace(/['";\\]/g, '') // Remove SQL injection chars
			.trim();
	},

	/**
	 * Sanitize URLs
	 */
	url(input: string): string {
		try {
			const url = new URL(input);
			// Only allow http/https protocols
			if (!['http:', 'https:'].includes(url.protocol)) {
				throw new Error('Invalid protocol');
			}
			return url.toString();
		} catch {
			return '';
		}
	},

	/**
	 * Sanitize Starknet addresses
	 */
	starknetAddress(input: string): string {
		// Remove any non-hex characters except 0x prefix
		const cleaned = input.replace(/[^0-9a-fA-Fx]/g, '');

		// Validate format
		if (!/^0x[0-9a-fA-F]{1,64}$/.test(cleaned)) {
			throw new Error('Invalid Starknet address format');
		}

		return cleaned.toLowerCase();
	},

	/**
	 * Sanitize Lightning invoice/address
	 */
	lightningInvoice(input: string): string {
		// Lightning invoices should start with lnbc, lntb, or be a valid Bitcoin address
		const cleaned = input.trim().toLowerCase();

		if (cleaned.startsWith('lnbc') || cleaned.startsWith('lntb')) {
			// Basic Lightning invoice format validation
			if (!/^ln[bt][a-z0-9]+$/.test(cleaned)) {
				throw new Error('Invalid Lightning invoice format');
			}
			return cleaned;
		}

		// For other formats, basic alphanumeric check
		if (!/^[a-zA-Z0-9@._-]+$/.test(input)) {
			throw new Error('Invalid Lightning address format');
		}

		return input.trim();
	}
};

/**
 * Validation utilities
 */
export const validate = {
	/**
	 * Validate email format
	 */
	email(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	},

	/**
	 * Validate username format
	 */
	username(username: string): boolean {
		const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
		return usernameRegex.test(username);
	},

	/**
	 * Validate amount for financial operations
	 */
	amount(amount: number | string, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): boolean {
		const num = typeof amount === 'string' ? parseFloat(amount) : amount;
		return !isNaN(num) && isFinite(num) && num >= min && num <= max;
	},

	/**
	 * Validate Starknet address
	 */
	starknetAddress(address: string): boolean {
		return /^0x[0-9a-fA-F]{1,64}$/.test(address);
	},

	/**
	 * Validate swap ID format
	 */
	swapId(id: string): boolean {
		// UUIDs or alphanumeric IDs
		return /^[a-zA-Z0-9_-]{8,64}$/.test(id);
	}
};

/**
 * Security event types for logging
 */
export type SecurityEventType =
	| 'rate_limit_exceeded'
	| 'invalid_input_detected'
	| 'authentication_failure'
	| 'suspicious_activity'
	| 'csp_violation'
	| 'unauthorized_access_attempt';

/**
 * Log security events
 */
export function logSecurityEvent(
	type: SecurityEventType,
	details: Record<string, any>,
	severity: 'low' | 'medium' | 'high' = 'medium'
): void {
	const event = {
		type,
		severity,
		timestamp: new Date().toISOString(),
		details: {
			...details,
			userAgent: details.userAgent || 'unknown',
			ip: details.ip || 'unknown'
		}
	};

	// Log to console in development
	if (getNodeEnv() === 'development') {
		console.warn('🔒 Security Event:', event);
	}

	// In production, this would integrate with your monitoring system
	// monitoring.trackSecurityEvent(type, severity, event);
}

/**
 * Check if request is from a trusted origin
 */
export function isTrustedOrigin(origin: string | null, allowedOrigins: string[]): boolean {
	if (!origin) return false;
	return allowedOrigins.includes(origin);
}

/**
 * Generate Content Security Policy violation report handler
 */
export function handleCSPViolation(report: any): void {
	logSecurityEvent(
		'csp_violation',
		{
			documentUri: report['document-uri'],
			violatedDirective: report['violated-directive'],
			blockedUri: report['blocked-uri'],
			originalPolicy: report['original-policy']
		},
		'high'
	);
}
