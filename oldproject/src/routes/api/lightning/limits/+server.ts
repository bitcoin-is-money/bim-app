/**
 * @fileoverview Lightning Network Limits API Endpoint
 *
 * This endpoint fetches Lightning Network transaction limits from the Atomiq SDK
 * and returns them in a standardized format. It serves as the bridge between
 * the frontend and the Atomiq SDK for dynamic limit management.
 *
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/utils/monitoring - Monitoring integration
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
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
import { monitoring } from '$lib/utils/monitoring';
import type { RequestHandler } from './$types';

/**
 * GET /api/lightning/limits
 *
 * Fetches current Lightning Network transaction limits from Atomiq SDK.
 * Returns limits for all supported assets including min/max amounts and fees.
 *
 * Query Parameters:
 * - asset (optional): Specific asset to get limits for
 *
 * Response Format:
 * {
 *   "assets": {
 *     "USDC": {
 *       "minAmount": 1000,
 *       "maxAmount": 10000000,
 *       "maxDailyVolume": 100000000,
 *       "fees": {
 *         "fixed": 100,
 *         "percentage": 0.1
 *       }
 *     },
 *     ...
 *   },
 *   "updatedAt": "2024-01-01T00:00:00Z"
 * }
 */
const getLimitsHandler: RequestHandler = async ({ url }) => {
	const startTime = Date.now();

	const asset = url.searchParams.get('asset');

	// Validate asset parameter if provided
	if (asset) {
		const validationErrors = validateQueryParams(url.searchParams, [], {
			asset: validators.supportedAsset
		});

		if (validationErrors.length > 0) {
			return createErrorResponse(
				ApiErrorCode.VALIDATION_ERROR,
				'Query parameter validation failed',
				undefined,
				validationErrors
			);
		}
	}

	logger.info('Fetching Lightning Network limits from Atomiq SDK', { asset });

	// Backward-compatible behavior: if pair parameters are provided, delegate to atomiq-limits
	const source = url.searchParams.get('source');
	const destination = url.searchParams.get('destination');
	if (source && destination) {
		const limits = await atomiqLimits.getPairLimits(source, destination);
		return createSuccessResponse(
			{
				asset: destination,
				...limits,
				updatedAt: new Date().toISOString()
			},
			{ requestId: crypto.randomUUID() }
		);
	}

	// Otherwise, return per-asset limits from AtomiqService
	const supportedAssets = await getAtomiqService().getSupportedAssets();

	// Convert to API response format
	const assetsResponse: Record<string, any> = {};

	for (const [assetSymbol, limits] of Object.entries(supportedAssets)) {
		assetsResponse[assetSymbol] = {
			minAmount: limits.minAmount,
			maxAmount: limits.maxAmount,
			maxDailyVolume: limits.maxDailyVolume,
			fees: limits.fees
		};
	}

	const limitsResponse = {
		assets: assetsResponse,
		updatedAt: new Date().toISOString()
	};

	// If specific asset requested, return just that asset
	if (asset) {
		const assetLimits = limitsResponse.assets[asset];
		if (!assetLimits) {
			logger.warn('Requested asset not supported', { asset });
			return createErrorResponse(
				ApiErrorCode.UNSUPPORTED_ASSET,
				`Asset ${asset} is not supported for Lightning swaps`,
				{
					requestedAsset: asset,
					supportedAssets: Object.keys(limitsResponse.assets)
				}
			);
		}

		const response = {
			asset,
			...assetLimits,
			updatedAt: limitsResponse.updatedAt
		};

		return createSuccessResponse(response, {
			requestId: crypto.randomUUID()
		});
	}

	// Return all assets
	const responseTime = Date.now() - startTime;

	logger.info('Lightning limits fetched successfully from Atomiq SDK', {
		assets: Object.keys(limitsResponse.assets),
		responseTime
	});

	monitoring.addBreadcrumb('Lightning limits fetched', 'api', {
		assets: Object.keys(limitsResponse.assets),
		responseTime
	});

	return createSuccessResponse(limitsResponse, {
		requestId: crypto.randomUUID()
	});
};

export const GET = withErrorHandling(getLimitsHandler, '/api/lightning/limits');

/**
 * POST /api/lightning/limits
 *
 * Updates Lightning Network limits (admin only).
 * This endpoint would be used by administrators to override
 * or update limits when needed.
 *
 * Request Body:
 * {
 *   "asset": "USDC",
 *   "minAmount": 1000,
 *   "maxAmount": 10000000,
 *   "maxDailyVolume": 100000000
 * }
 */
const updateLimitsHandler: RequestHandler = async ({ request }) => {
	const body = await request.json();

	logger.info('Updating Lightning limits', body);

	// TODO: Implement admin authentication
	// TODO: Implement actual limits update logic

	return createErrorResponse(
		ApiErrorCode.NOT_IMPLEMENTED,
		'Limits update functionality not yet implemented',
		{
			feature: 'limits_update',
			plannedImplementation: 'future_release'
		}
	);
};

export const POST = withErrorHandling(updateLimitsHandler, '/api/lightning/limits');
