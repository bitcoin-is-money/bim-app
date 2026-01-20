/**
 * Ultra-minimal health check endpoint for Railway deployment
 *
 * This endpoint has ZERO dependencies on application services, middleware,
 * logging, or any other potentially failing components. It should always
 * return 200 OK for Railway health checks.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Use basic console.log instead of logger to avoid dependencies
		console.log('[HEALTH-SIMPLE] Health check requested');

		const response = {
			status: 'healthy',
			timestamp: new Date().toISOString(),
			version: '1.0.0',
			uptime: process.uptime(),
			endpoint: 'minimal'
		};

		console.log('[HEALTH-SIMPLE] Health check successful');
		return json(response, { status: 200 });
	} catch (error) {
		// Even in total failure, return 200 for Railway
		console.error('[HEALTH-SIMPLE] Health check error:', error);

		return json(
			{
				status: 'degraded',
				timestamp: new Date().toISOString(),
				version: '1.0.0',
				uptime: 0,
				endpoint: 'minimal',
				error: error instanceof Error ? error.message : 'Health check failed'
			},
			{ status: 200 } // Always 200 for Railway compatibility
		);
	}
};
