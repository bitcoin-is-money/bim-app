/**
 * @fileoverview Server-side SvelteKit hooks for request/response middleware
 *
 * This file implements the core server-side middleware pipeline for the WebAuthn Starknet
 * account deployment application. It handles:
 * - Request correlation and structured logging
 * - User authentication and session management
 * - Security headers and CORS configuration
 * - Structured logging and monitoring
 * - Performance monitoring and request tracing
 *
 * The middleware pipeline processes every server-side request before it reaches
 * the route handlers, ensuring consistent security, logging, and monitoring.
 *
 * @requires @sveltejs/kit/hooks - SvelteKit hooks utilities
 * @requires $lib/auth/session - Authentication and session management
 * @requires $lib/utils/logger - Structured logging system
 * @requires $lib/utils/monitoring - Application monitoring and alerting
 *
 * @author bim
 * @version 1.0.0
 */

import { getCurrentUser } from '$lib/auth/session';
import { applyEndpointProtection } from '$lib/middleware/auth';
import { createRequestContext, generateRequestId, logger } from '$lib/utils/logger';
import { initMonitoringFromEnv } from '$lib/utils/monitoring';
import { getSecurityHeaders } from '$lib/utils/security';
import { backgroundJobsService } from '$lib/services/server/background-jobs.service';
import type { Handle } from '@sveltejs/kit';
import { initializeI18nForSSR, normalizeLocale } from '$lib/i18n';

/**
 * Initialize monitoring system and application services on server startup
 *
 * This sets up:
 * - Environment variable validation
 * - Performance monitoring baseline
 * - Structured logging configuration
 *
 * The initialization is wrapped in a try-catch block to ensure
 * application startup failures are properly logged and reported.
 */
try {
	/**
	 * Initialize monitoring system from environment variables
	 * This sets up performance monitoring and application health checks
	 * based on environment configuration
	 */
	initMonitoringFromEnv();

	/**
	 * Initialize background jobs service for blockchain scanning
	 * This starts periodic tasks including transaction monitoring
	 */
	backgroundJobsService.startJobs();

	/**
	 * Log successful application initialization
	 * Records application startup with environment context
	 * for debugging and monitoring purposes
	 */
	logger.info('Application initialized successfully', {
		environment:
			typeof process !== 'undefined' && process.env
				? process.env.NODE_ENV || 'development'
				: 'development',
		nodeVersion: typeof process !== 'undefined' && process.version ? process.version : 'unknown',
		platform: typeof process !== 'undefined' && process.platform ? process.platform : 'unknown',
		timestamp: new Date().toISOString()
	});

	/**
	 * Additional startup success indicator for operations teams
	 * Makes it clear when the full application stack is ready
	 */
	console.log('🎉 BIM3 WebAuthn Starknet Application is ready!');
	console.log('🌐 Server listening and ready to handle requests');
	if (process.env.NODE_ENV === 'production') {
		console.log('✅ All SIGTERM errors during startup indicate normal Railway restart behavior');
	}
} catch (error) {
	/**
	 * Handle initialization failures
	 * Critical errors during startup are logged and reported
	 * but don't prevent the application from starting
	 */
	logger.error('Failed to initialize application', error as Error, {
		phase: 'startup',
		environment:
			typeof process !== 'undefined' && process.env
				? process.env.NODE_ENV || 'development'
				: 'development'
	});
}

/**
 * Main server-side request handler middleware pipeline
 *
 * This handles the complete request/response lifecycle with the following phases:
 * 1. Request initialization and correlation ID generation
 * 2. User authentication and session validation
 * 3. Request processing through SvelteKit resolvers
 * 4. Security header injection and CORS configuration
 * 5. Response logging and performance monitoring
 *
 * This handles the complete request/response cycle with error logging.
 *
 * @param {RequestEvent} event - SvelteKit request event object
 * @param {Resolve} resolve - SvelteKit resolver function
 * @returns {Promise<Response>} - Processed HTTP response with security headers
 */
export const handle: Handle = async ({ event, resolve }) => {
	// FAST PATH: Bypass all middleware for health check endpoints
	// This prevents health checks from failing due to middleware issues
	if (event.url.pathname === '/api/health' || event.url.pathname === '/api/health-simple') {
		console.log(`[HEALTH-BYPASS] Bypassing middleware for ${event.url.pathname}`);
		try {
			return await resolve(event);
		} catch (error) {
			console.error(`[HEALTH-BYPASS] Health check error: ${error}`);
			// Even on error, try to return something for Railway
			return new Response(
				JSON.stringify({
					status: 'degraded',
					error: 'Health check bypass failed',
					timestamp: new Date().toISOString()
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
	}

	// Start performance timing for request processing
	const startTime = Date.now();

	/**
	 * Generate unique request ID for correlation across logs and monitoring
	 * This ID is used to track a single request through all system components
	 */
	(event.locals as any).requestId = generateRequestId();

	/**
	 * Create structured request context for consistent logging
	 * Includes request metadata, user agent, IP address, and correlation ID
	 */
	const context = createRequestContext(event);

	/**
	 * Log incoming request for monitoring and debugging
	 * Captures HTTP method, path, and contextual information
	 */
	logger.request(event.request.method, event.url.pathname, context);

	// --- Locale detection & SSR i18n initialization ---
	// Prefer cookie, then Accept-Language header, then English
	function parseAcceptLanguage(header: string | null): string | undefined {
		if (!header) return undefined;
		// Parse tokens with optional quality values and pick the highest
		const tokens = header
			.split(',')
			.map((p) => p.trim())
			.map((part) => {
				const [tag, qStr] = part.split(';');
				const q = qStr?.startsWith('q=') ? parseFloat(qStr.slice(2)) : 1;
				return { tag, q: isNaN(q) ? 0 : q };
			})
			.filter((t) => !!t.tag)
			.sort((a, b) => b.q - a.q);
		return tokens[0]?.tag;
	}

	const cookieLocale = event.cookies.get('lang');
	const headerLocale = parseAcceptLanguage(event.request.headers.get('accept-language'));
	const pickedRaw = (cookieLocale || headerLocale || 'en').toLowerCase();
	const validLocale = normalizeLocale(pickedRaw) || 'en';
	(event.locals as any).locale = validLocale;

	// Persist cookie for future requests (1 year)
	if (cookieLocale !== validLocale) {
		event.cookies.set('lang', validLocale, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax'
		});
	}

	// Initialize i18n for SSR before resolving the request so all components render localized
	try {
		await initializeI18nForSSR(validLocale);
	} catch (e) {
		console.error('[hooks] Failed to initialize SSR i18n', e);
	}

	/**
	 * Authenticate user for all requests
	 * Checks session cookies and populates event.locals.user
	 * This ensures user context is available to all route handlers
	 */
	(event.locals as any).user = await getCurrentUser(event);

	/**
	 * Apply endpoint-specific authentication and rate limiting for API routes
	 * This protects sensitive endpoints with appropriate security measures
	 */
	if (event.url.pathname.startsWith('/api/')) {
		try {
			const authResult = applyEndpointProtection(event);
			(event.locals as any).authResult = authResult;
		} catch (authError) {
			// Authentication/authorization errors are thrown as SvelteKit errors
			// They will be handled by the error handler and returned to the client
			throw authError;
		}
	}

	/**
	 * Handle CORS preflight early for API routes
	 */
	if (event.request.method === 'OPTIONS' && event.url.pathname.startsWith('/api/')) {
		const preflight = new Response(null, { status: 204 });
		preflight.headers.set('Access-Control-Allow-Origin', event.url.origin);
		preflight.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		preflight.headers.set(
			'Access-Control-Allow-Headers',
			'Content-Type, Authorization, X-API-Key, X-Internal-Key'
		);
		preflight.headers.set('Access-Control-Allow-Credentials', 'true');
		preflight.headers.set('Access-Control-Max-Age', '600');
		return preflight;
	}

	/**
	 * Process the request through SvelteKit's resolver chain
	 * This calls the appropriate route handler and returns the response
	 */
	const response = await resolve(event);

	// Indicate response varies by language preference
	response.headers.set(
		'Vary',
		[response.headers.get('Vary'), 'Accept-Language'].filter(Boolean).join(', ')
	);

	/**
	 * Apply comprehensive security headers to prevent common web vulnerabilities
	 *
	 * This includes:
	 * - Content Security Policy (CSP) with WebAuthn/crypto support
	 * - HTTP Strict Transport Security (HSTS)
	 * - Anti-clickjacking protection
	 * - MIME type sniffing prevention
	 * - Cross-origin isolation
	 * - Permission restrictions
	 */
	const securityHeaders = getSecurityHeaders({
		csp: true,
		includeHSTS: true,
		allowCamera: true // Allow camera access for QR scanning functionality
	});

	// Apply all security headers
	Object.entries(securityHeaders).forEach(([key, value]) => {
		if (value) {
			response.headers.set(key, value);
		}
	});

	// CSP headers are already set above

	/**
	 * Configure CORS headers for API routes
	 *
	 * Allows cross-origin requests from the same origin for API endpoints
	 * Supports credentials for authenticated API calls
	 * Restricts allowed methods and headers for security
	 */
	if (event.url.pathname.startsWith('/api/')) {
		response.headers.set('Access-Control-Allow-Origin', event.url.origin);
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		response.headers.set(
			'Access-Control-Allow-Headers',
			'Content-Type, Authorization, X-API-Key, X-Internal-Key'
		);
		response.headers.set('Access-Control-Allow-Credentials', 'true');
		response.headers.set('Access-Control-Max-Age', '600');
	}

	/**
	 * Add request correlation ID to response headers
	 * Enables request tracing and debugging across client/server boundary
	 */
	response.headers.set('X-Request-ID', (event.locals as any).requestId);

	/**
	 * Log response completion with performance metrics
	 * Records response status, processing time, and contextual information
	 */
	const duration = Date.now() - startTime;
	logger.response(event.request.method, event.url.pathname, response.status, duration, context);

	return response;
};

/**
 * Global error handler with structured logging
 *
 * Captures and logs all unhandled errors that occur during request processing
 */
export const handleError = ({
	error,
	event
}: {
	error: unknown;
	event: {
		url: { pathname: string };
		request: { method: string };
		locals: any;
	};
}) => {
	logger.error('Unhandled error in request', error as Error, {
		url: event.url.pathname,
		method: event.request.method,
		requestId: (event.locals as any).requestId
	});
};
