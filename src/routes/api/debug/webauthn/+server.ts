/**
 * WebAuthn Debug API endpoint
 * Provides comprehensive debugging information for WebAuthn configuration
 * Should only be accessible in development/staging environments
 */

import { dev } from '$app/environment';
import { PublicEnv } from '$lib/config/env';
import { WEBAUTHN_CONFIG } from '$lib/constants';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	// Security: Only allow in development or staging; hard-disable in production builds
	const nodeEnv = process.env.NODE_ENV || 'development';
	if (!dev && nodeEnv === 'production') {
		logger.warn('WebAuthn debug endpoint accessed in production', {
			origin: request.headers.get('origin'),
			userAgent: request.headers.get('user-agent')
		});
		return json({ error: 'Debug endpoint not available in production' }, { status: 403 });
	}

	// Gather comprehensive WebAuthn configuration
	const debugInfo = {
		timestamp: new Date().toISOString(),
		environment: nodeEnv,
		request: {
			origin: request.headers.get('origin'),
			host: request.headers.get('host'),
			userAgent: request.headers.get('user-agent'),
			url: url.toString()
		},
		webauthn: {
			configConstants: {
				RP_ID: PublicEnv.WEBAUTHN_RP_ID(),
				RP_NAME: WEBAUTHN_CONFIG.RP_NAME,
				AUTHENTICATOR_SELECTION: WEBAUTHN_CONFIG.AUTHENTICATOR_SELECTION
			},
			environmentVariables: {
				PUBLIC_WEBAUTHN_RP_ID: PublicEnv.WEBAUTHN_RP_ID() || null,
				PUBLIC_WEBAUTHN_RP_NAME: PublicEnv.WEBAUTHN_RP_NAME() || null,
				PUBLIC_BIM_ARGENT_050_ACCOUNT_CLASS_HASH:
					PublicEnv.BIM_ARGENT_050_ACCOUNT_CLASS_HASH() || null
			},
			resolved: {
				rpId: PublicEnv.WEBAUTHN_RP_ID(),
				rpName: PublicEnv.WEBAUTHN_RP_NAME(),
				accountClassHash: PublicEnv.BIM_ARGENT_050_ACCOUNT_CLASS_HASH()
			},
			expectedOrigins: [
				`https://${PublicEnv.WEBAUTHN_RP_ID()}`,
				...(PublicEnv.WEBAUTHN_RP_ID() === 'localhost'
					? ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000']
					: [])
			]
		},
		validation: {
			rpIdMatches: request.headers.get('host') === PublicEnv.WEBAUTHN_RP_ID(),
			originMatches:
				request.headers.get('origin') === `https://${PublicEnv.WEBAUTHN_RP_ID()}` ||
				(PublicEnv.WEBAUTHN_RP_ID() === 'localhost' &&
					['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'].includes(
						request.headers.get('origin') || ''
					))
		},
		recommendations: []
	};

	// Add recommendations based on findings
	if (!debugInfo.validation.rpIdMatches) {
		debugInfo.recommendations.push(
			`Host mismatch: Expected '${PublicEnv.WEBAUTHN_RP_ID()}' but got '${request.headers.get('host')}'. Set PUBLIC_WEBAUTHN_RP_ID environment variable.`
		);
	}

	if (!debugInfo.validation.originMatches) {
		debugInfo.recommendations.push(
			`Origin mismatch: Expected origin matching RP ID '${PublicEnv.WEBAUTHN_RP_ID()}' but got '${request.headers.get('origin')}'.`
		);
	}

	if (!PublicEnv.WEBAUTHN_RP_ID()) {
		debugInfo.recommendations.push(
			'PUBLIC_WEBAUTHN_RP_ID environment variable is not set. Using fallback from constants.'
		);
	}

	logger.info('WebAuthn debug endpoint accessed', {
		nodeEnv,
		rpId: PublicEnv.WEBAUTHN_RP_ID(),
		host: request.headers.get('host'),
		origin: request.headers.get('origin'),
		validation: debugInfo.validation
	});

	return json(debugInfo, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Access-Control-Allow-Origin': '*'
		}
	});
};
