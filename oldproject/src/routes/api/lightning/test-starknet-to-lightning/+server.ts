/**
 * @fileoverview Test endpoint for Starknet to Lightning functionality
 *
 * This endpoint provides a simple test to verify that the Starknet to Lightning
 * swap functionality is working correctly.
 *
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/server/services/atomiq.service - Atomiq service
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';

/**
 * Test response
 */
interface TestResponse {
	success: boolean;
	message: string;
	timestamp: string;
	sdkStatus: {
		isInitialized: boolean;
		hasSwapper: boolean;
		hasSwapperFactory: boolean;
	};
}

/**
 * Test Starknet to Lightning functionality
 */
const testHandler = async (): Promise<Response> => {
	logger.info('Testing Starknet to Lightning functionality');

	try {
		// Check if Atomiq service is initialized
		const sdkStatus = {
			isInitialized: atomiqService['isInitialized'],
			hasSwapper: !!atomiqService['swapper'],
			hasSwapperFactory: !!atomiqService['swapperFactory']
		};

		logger.info('SDK status check', sdkStatus);

		// Test if we can access tokens
		let tokenTest = false;
		try {
			if (atomiqService['swapperFactory']) {
				const tokens = (atomiqService['swapperFactory'] as any).Tokens;
				tokenTest = !!(tokens?.STARKNET?.ETH && tokens?.BITCOIN?.BTCLN);
				logger.info('Token access test', { tokenTest, hasTokens: !!tokens });
			}
		} catch (error) {
			logger.error('Token access test failed', error as Error);
		}

		const response: TestResponse = {
			success: sdkStatus.isInitialized && sdkStatus.hasSwapper && tokenTest,
			message:
				sdkStatus.isInitialized && sdkStatus.hasSwapper && tokenTest
					? 'Starknet to Lightning functionality is ready'
					: 'Starknet to Lightning functionality is not ready',
			timestamp: new Date().toISOString(),
			sdkStatus
		};

		logger.info('Starknet to Lightning test completed', response);

		return createSuccessResponse(response, {
			timestamp: new Date().toISOString(),
			requestId: crypto.randomUUID()
		});
	} catch (error) {
		logger.error('Starknet to Lightning test failed', error as Error);
		return createErrorResponse(ApiErrorCode.INTERNAL_ERROR, 'Test failed', {
			originalError: (error as Error).message
		});
	}
};

export const GET = withErrorHandling(testHandler, '/api/lightning/test-starknet-to-lightning');
