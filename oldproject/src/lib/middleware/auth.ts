/**
 * @fileoverview Authentication Middleware for API Endpoints
 *
 * Provides authentication and authorization middleware for protecting
 * sensitive API endpoints in the WebAuthn Starknet application.
 *
 * @author bim
 * @version 1.0.0
 */

import { getServerErrorMessage } from '$lib/i18n/server';
import { endpointRateLimit, ipRateLimit, userRateLimit } from '$lib/utils/network/rate-limit';
import { logSecurityEvent } from '$lib/utils/security';
import { error, type RequestEvent } from '@sveltejs/kit';
import { ServerPrivateEnv } from '$lib/config/server';

/**
 * Authentication result interface
 */
export interface AuthResult {
	authenticated: boolean;
	user?: any;
	error?: string;
}

/**
 * Protected endpoint configuration
 */
export interface EndpointConfig {
	requireAuth: boolean;
	rateLimitConfig?: {
		maxRequests: number;
		windowMs: number;
	};
	allowedMethods?: string[];
}

/**
 * Endpoint type mapping for rate limiting
 */
const ENDPOINT_RATE_LIMIT_TYPES = {
	auth: 'auth' as const,
	financial: 'financial' as const,
	webauthn: 'webauthn' as const,
	api: 'api' as const,
	rpc: 'rpc' as const,
	read: 'read' as const
};

/**
 * Check if user is authenticated
 */
export function checkAuthentication(event: RequestEvent): AuthResult {
	const user = (event.locals as any).user;

	if (!user) {
		logSecurityEvent(
			'authentication_failure',
			{
				path: event.url.pathname,
				ip: event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent')
			},
			'medium'
		);

		return {
			authenticated: false,
			error: getServerErrorMessage('authentication_required')
		};
	}

	return {
		authenticated: true,
		user
	};
}

/**
 * Apply comprehensive rate limiting to endpoint
 */
export function applyRateLimit(
	event: RequestEvent,
	endpointType: 'auth' | 'financial' | 'webauthn' | 'api' | 'read'
): void {
	const ip = event.getClientAddress();
	const path = event.url.pathname;
	const userAgent = event.request.headers.get('user-agent');
	const user = (event.locals as any).user;

	try {
		// Apply IP-based rate limiting first (prevents abuse from single IPs)
		ipRateLimit(ip, path, userAgent || undefined);

		// Apply endpoint-specific rate limiting
		const endpointIdentifier = ip; // Use IP as identifier for anonymous requests
		endpointRateLimit(endpointIdentifier, endpointType);

		// Apply user-based rate limiting if authenticated
		if (user?.id) {
			const userTier = user.tier || 'basic'; // Assume user has a tier property
			userRateLimit(user.id, path, userTier);
		}
	} catch (rateLimitError: any) {
		// Enhanced logging for rate limit violations
		logSecurityEvent(
			'rate_limit_exceeded',
			{
				path,
				ip,
				userAgent: userAgent || 'unknown',
				endpointType,
				userId: user?.id || 'anonymous',
				userTier: user?.tier || 'basic'
			},
			'high'
		);

		throw rateLimitError;
	}
}

/**
 * Validate HTTP method against allowed methods
 */
export function validateMethod(event: RequestEvent, allowedMethods: string[]): void {
	if (!allowedMethods.includes(event.request.method)) {
		logSecurityEvent(
			'unauthorized_access_attempt',
			{
				path: event.url.pathname,
				method: event.request.method,
				allowedMethods,
				ip: event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent')
			},
			'medium'
		);

		throw error(405, getServerErrorMessage('method_not_allowed'));
	}
}

/**
 * Authentication middleware factory
 */
export function createAuthMiddleware(
	config: EndpointConfig & {
		endpointType: keyof typeof ENDPOINT_RATE_LIMIT_TYPES;
	}
) {
	return function authMiddleware(event: RequestEvent): AuthResult {
		// Validate HTTP method if specified
		if (config.allowedMethods) {
			validateMethod(event, config.allowedMethods);
		}

		// Apply comprehensive rate limiting
		applyRateLimit(event, ENDPOINT_RATE_LIMIT_TYPES[config.endpointType]);

		// Check authentication if required
		if (config.requireAuth) {
			const authResult = checkAuthentication(event);
			if (!authResult.authenticated) {
				throw error(401, authResult.error || getServerErrorMessage('authentication_required'));
			}
			return authResult;
		}

		return { authenticated: false };
	};
}

/**
 * Pre-configured middleware for common endpoint types
 */
export const authMiddleware = {
	/**
	 * Authentication endpoints (login, register, etc.)
	 */
	auth: createAuthMiddleware({
		requireAuth: false,
		endpointType: 'auth',
		allowedMethods: ['POST']
	}),

	/**
	 * Financial operations (Lightning, Bitcoin swaps)
	 */
	financial: createAuthMiddleware({
		requireAuth: true,
		endpointType: 'financial',
		allowedMethods: ['GET', 'POST']
	}),

	/**
	 * WebAuthn operations
	 */
	webauthn: createAuthMiddleware({
		requireAuth: false, // WebAuthn creates authentication
		endpointType: 'webauthn',
		allowedMethods: ['GET', 'POST']
	}),

	/**
	 * Protected API endpoints
	 */
	protected: createAuthMiddleware({
		requireAuth: true,
		endpointType: 'api',
		allowedMethods: ['GET', 'POST', 'PUT', 'DELETE']
	}),

	/**
	 * Public read-only endpoints
	 */
	public: createAuthMiddleware({
		requireAuth: false,
		endpointType: 'read',
		allowedMethods: ['GET']
	}),

	/**
	 * RPC proxy endpoints (allow POST for RPC calls)
	 */
	rpc: createAuthMiddleware({
		requireAuth: false,
		endpointType: 'api',
		allowedMethods: ['POST', 'HEAD']
	}),

	/**
	 * RPC endpoints that require either a user session OR an internal API key
	 */
	rpcProtected: (event: RequestEvent) => {
		// Validate HTTP method
		validateMethod(event, ['GET', 'POST', 'HEAD']);

		// Apply rate limiting tuned for RPC
		applyRateLimit(event, ENDPOINT_RATE_LIMIT_TYPES['rpc']);

		const user = (event.locals as any).user;
		// Allow either authenticated user OR a valid internal API key
		const headerKey =
			event.request.headers.get('x-api-key') || event.request.headers.get('x-internal-key') || '';
		const expectedKey =
			ServerPrivateEnv.get('RPC_INTERNAL_KEY') || ServerPrivateEnv.get('ADMIN_INTERNAL_KEY');

		if (!user && (!expectedKey || headerKey !== expectedKey)) {
			logSecurityEvent(
				'unauthorized_access_attempt',
				{
					path: event.url.pathname,
					method: event.request.method,
					ip: event.getClientAddress(),
					userAgent: event.request.headers.get('user-agent'),
					reason: 'rpc_protected_missing_auth_or_invalid_key'
				},
				'high'
			);

			throw error(401, getServerErrorMessage('authentication_required'));
		}

		return { authenticated: !!user, user };
	}
};

/**
 * Endpoint protection map - defines which endpoints need what protection
 */
export const ENDPOINT_PROTECTION: Record<string, keyof typeof authMiddleware> = {
	// Authentication endpoints
	'/api/auth/login': 'auth',
	'/api/auth/register': 'auth',
	'/api/auth/logout': 'auth',

	// WebAuthn endpoints
	'/api/webauthn/register/begin': 'webauthn',
	'/api/webauthn/register/complete': 'webauthn',
	'/api/webauthn/authenticate/begin': 'webauthn',
	'/api/webauthn/authenticate/complete': 'webauthn',

	// Lightning Network endpoints
	'/api/lightning/invoice': 'financial',
	'/api/lightning/pay': 'financial',
	'/api/lightning/balance': 'financial',
	'/api/lightning/channels': 'financial',

	// Bitcoin endpoints
	'/api/bitcoin/swap': 'financial',
	'/api/bitcoin/address': 'financial',
	'/api/bitcoin/transaction': 'financial',

	// Starknet endpoints
	'/api/starknet/deploy': 'protected',
	'/api/starknet/account': 'protected',
	'/api/starknet/transaction': 'protected',

	// User management
	'/api/user/profile': 'protected',
	'/api/user/settings': 'protected',

	// RPC proxy endpoints
	'/api/rpc': 'rpcProtected',
	'/api/rpc-call': 'rpcProtected',
	'/api/rpc/balance': 'rpcProtected',
	'/api/rpc/estimate-fee': 'rpcProtected',
	'/api/rpc/nonce': 'rpcProtected',
	'/api/rpc/nonce-for-address': 'rpcProtected',
	'/api/rpc/wait-transaction': 'rpcProtected',
	'/api/rpc/fast-wait-transaction': 'rpcProtected',

	// Admin/maintenance endpoints (protected by shared secret at route level)
	'/api/admin/cleanup/webauthn': 'webauthn',

	// Public endpoints
	'/api/health': 'public',
	'/api/status': 'public'
};

/**
 * Apply authentication middleware based on endpoint path
 */
export function applyEndpointProtection(event: RequestEvent): AuthResult {
	const path = event.url.pathname;
	const protectionType = ENDPOINT_PROTECTION[path];

	if (!protectionType) {
		// Default to protected for unknown API endpoints
		if (path.startsWith('/api/')) {
			return authMiddleware.protected(event);
		}

		// Non-API paths don't need API authentication
		return { authenticated: false };
	}

	// Apply the appropriate middleware
	return authMiddleware[protectionType](event);
}
