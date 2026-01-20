/**
 * @fileoverview Atomiq Pair Limits API Endpoint
 *
 * GET /api/atomiq/limits?source=STARKNET.WBTC&destination=BITCOIN.BTC
 * Returns min/max/fees for the pair. Accepts chain.token notation.
 */

import { atomiqLimits } from '$lib/services/server/atomiq-limits.service';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	validateQueryParams,
	validators,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

const getHandler: RequestHandler = async ({ url }) => {
	const source = url.searchParams.get('source');
	const destination = url.searchParams.get('destination');

	// Validate presence
	if (!source || !destination) {
		return createErrorResponse(
			ApiErrorCode.VALIDATION_ERROR,
			'source and destination are required (e.g., STARKNET.WBTC → BITCOIN.BTC)'
		);
	}

	logger.info('Fetching Atomiq pair limits', { source, destination });
	const limits = await atomiqLimits.getPairLimits(source, destination);

	return createSuccessResponse(
		{
			source,
			destination,
			...limits,
			updatedAt: new Date().toISOString()
		},
		{ requestId: crypto.randomUUID() }
	);
};

export const GET = withErrorHandling(getHandler, '/api/atomiq/limits');
