/**
 * WebAuthn .well-known configuration endpoint
 * This endpoint provides relying party configuration for WebAuthn validation
 * https://www.w3.org/TR/webauthn-2/#sctn-rp-id
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { WEBAUTHN_CONFIG } from '$lib/constants';
import { logger } from '$lib/utils/logger';

export const GET: RequestHandler = async ({ request }) => {
	// Get the configured relying party ID
	const rpId = env?.PUBLIC_WEBAUTHN_RP_ID || WEBAUTHN_CONFIG.RP_ID;

	// Log WebAuthn configuration for debugging
	logger.info('WebAuthn .well-known endpoint accessed', {
		rpId,
		configuredRpId: env?.PUBLIC_WEBAUTHN_RP_ID,
		fallbackRpId: WEBAUTHN_CONFIG.RP_ID,
		requestOrigin: request.headers.get('origin'),
		userAgent: request.headers.get('user-agent'),
		host: request.headers.get('host')
	});

	// WebAuthn configuration response
	const config = {
		rp: {
			id: rpId,
			name: WEBAUTHN_CONFIG.RP_NAME
		},
		origins: [
			`https://${rpId}`,
			// Add localhost origins for development
			...(rpId === 'localhost'
				? ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000']
				: [])
		],
		// Optional: specify supported authenticator types
		authenticatorSelection: WEBAUTHN_CONFIG.AUTHENTICATOR_SELECTION
	};

	logger.debug('WebAuthn configuration response', config);

	return json(config, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
			// CORS headers to allow cross-origin requests
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};

// Handle OPTIONS requests for CORS preflight
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400' // 24 hours
		}
	});
};
