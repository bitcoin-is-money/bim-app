/**
 * @fileoverview Supported Assets API Endpoint
 *
 * This endpoint provides the list of supported assets from the Atomiq SDK
 * to client-side code. This ensures we have a single source of truth
 * for supported assets instead of hardcoding them throughout the codebase.
 *
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/services/server/atomiq - Atomiq service
 * @requires $lib/utils/logger - Logging utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { getSupportedAssets } from '$lib/services/server/atomiq/atomiq-assets';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Get supported assets from Atomiq SDK
 *
 * GET /api/lightning/supported-assets
 *
 * Returns the list of supported assets from the Atomiq SDK.
 * This provides a single source of truth for supported assets
 * instead of hardcoding them throughout the codebase.
 *
 * @returns 200 - Supported assets retrieved successfully
 * @returns 500 - Internal server error
 */
export const GET: RequestHandler = async () => {
	try {
		logger.info('Fetching supported assets from Atomiq SDK');

		const supportedAssets = await getSupportedAssets();

		logger.info('Supported assets retrieved successfully', {
			count: supportedAssets.length,
			assets: supportedAssets
		});

		return json({
			success: true,
			data: {
				supportedAssets,
				count: supportedAssets.length,
				timestamp: new Date().toISOString()
			}
		});
	} catch (error) {
		logger.error('Failed to get supported assets', error as Error);

		return json(
			{
				success: false,
				error: 'Failed to retrieve supported assets',
				message: 'Unable to fetch supported assets from the service',
				data: {
					supportedAssets: [], // Fallback to empty array
					count: 0,
					timestamp: new Date().toISOString()
				}
			},
			{ status: 500 }
		);
	}
};
