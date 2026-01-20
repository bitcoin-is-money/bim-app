/**
 * @fileoverview Lightning Service Debug API
 *
 * This endpoint provides detailed diagnostic information about the Lightning
 * service stack including atomiq service, lightning-limits service, and
 * environment configuration. Used for troubleshooting service availability issues.
 *
 * @author bim
 * @version 1.0.0
 */

import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { getAtomiqService } from '$lib/services/server/atomiq';
import { lightningLimits } from '$lib/services/server/lightning-limits.service';
import { createSuccessResponse, withErrorHandling } from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

/**
 * Debug response interface
 */
interface DebugResponse {
	timestamp: string;
	environment: {
		starknetRpcUrl: string | undefined;
		bitcoinNetwork: string | undefined;
		publicBitcoinNetwork: string | undefined;
		atomiqWebhookUrl: string | undefined;
		hasWebhookSecret: boolean;
	};
	services: {
		atomiqService: {
			isInitialized: boolean;
			hasSwapper: boolean;
			hasSwapperFactory: boolean;
			activeSwapsCount: number;
			initializationError?: string;
		};
		lightningLimits: {
			isAvailable: boolean;
			supportedAssets: string[];
			limitsError?: string;
		};
	};
	connectivity: {
		starknetRpc: {
			accessible: boolean;
			responseTime?: number;
			error?: string;
		};
	};
}

/**
 * Get Lightning service debug information
 *
 * GET /api/lightning/debug
 *
 * Returns comprehensive diagnostic information about all Lightning services
 * including initialization status, configuration, and connectivity tests.
 *
 * @returns 200 - Debug information retrieved successfully
 * @returns 500 - Internal server error
 */
const getDebugHandler: RequestHandler = async ({ request }) => {
	// Hard-disable in production builds
	if (!dev && process.env.NODE_ENV === 'production') {
		logger.warn('Blocked access to lightning debug in production');
		return new Response(JSON.stringify({ error: 'Not Found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	logger.info('Lightning debug endpoint called');

	const debugInfo: DebugResponse = {
		timestamp: new Date().toISOString(),
		environment: {
			starknetRpcUrl: privateEnv.STARKNET_RPC_URL,
			bitcoinNetwork: privateEnv.BITCOIN_NETWORK,
			publicBitcoinNetwork: publicEnv.PUBLIC_BITCOIN_NETWORK,
			atomiqWebhookUrl: privateEnv.ATOMIQ_WEBHOOK_URL,
			hasWebhookSecret: !!privateEnv.ATOMIQ_WEBHOOK_SECRET
		},
		services: {
			atomiqService: {
				isInitialized: false,
				hasSwapper: false,
				hasSwapperFactory: false,
				activeSwapsCount: 0
			},
			lightningLimits: {
				isAvailable: false,
				supportedAssets: []
			}
		},
		connectivity: {
			starknetRpc: {
				accessible: false
			}
		}
	};

	// Test Starknet RPC connectivity
	if (privateEnv.STARKNET_RPC_URL) {
		try {
			logger.info('Testing Starknet RPC connectivity for debug');
			const startTime = Date.now();
			const response = await fetch(privateEnv.STARKNET_RPC_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'starknet_chainId',
					params: [],
					id: 1
				}),
				signal: AbortSignal.timeout(5000) // 5 second timeout
			});

			debugInfo.connectivity.starknetRpc.responseTime = Date.now() - startTime;
			debugInfo.connectivity.starknetRpc.accessible = response.ok;

			if (!response.ok) {
				debugInfo.connectivity.starknetRpc.error = `HTTP ${response.status}: ${response.statusText}`;
			}
		} catch (rpcError) {
			debugInfo.connectivity.starknetRpc.error = (rpcError as Error).message;
			logger.error('Starknet RPC connectivity test failed in debug', rpcError as Error);
		}
	} else {
		debugInfo.connectivity.starknetRpc.error = 'STARKNET_RPC_URL not configured';
	}

	// Test Atomiq Service status
	try {
		logger.info('Testing atomiq service status for debug');

		// Get service state without forcing initialization
		const atomiqService = getAtomiqService();
		const serviceState = atomiqService as any;
		debugInfo.services.atomiqService = {
			isInitialized: serviceState.isInitialized || false,
			hasSwapper: !!serviceState.swapper,
			hasSwapperFactory: !!serviceState.swapperFactory,
			activeSwapsCount: serviceState.getActiveSwapsCount ? serviceState.getActiveSwapsCount() : 0
		};

		// Try to get supported assets to test service functionality
		try {
			const supportedAssets = await atomiqService.getSupportedAssets();
			debugInfo.services.atomiqService.initializationError = undefined;
			logger.info('Atomiq service is working properly', {
				assetsCount: Object.keys(supportedAssets).length
			});
		} catch (assetsError) {
			debugInfo.services.atomiqService.initializationError = (assetsError as Error).message;
			logger.error('Atomiq service getSupportedAssets failed', assetsError as Error);
		}
	} catch (atomiqError) {
		debugInfo.services.atomiqService.initializationError = (atomiqError as Error).message;
		logger.error('Atomiq service status check failed', atomiqError as Error);
	}

	// Test Lightning Limits Service
	try {
		logger.info('Testing lightning limits service for debug');

		const limits = await lightningLimits.getLimits('WBTC');
		debugInfo.services.lightningLimits = {
			isAvailable: true,
			supportedAssets: Object.keys(limits)
		};
		logger.info('Lightning limits service is working properly');
	} catch (limitsError) {
		debugInfo.services.lightningLimits = {
			isAvailable: false,
			supportedAssets: [],
			limitsError: (limitsError as Error).message
		};
		logger.error('Lightning limits service failed', limitsError as Error);
	}

	logger.info('Debug information collected', {
		atomiqInitialized: debugInfo.services.atomiqService.isInitialized,
		limitsAvailable: debugInfo.services.lightningLimits.isAvailable,
		rpcAccessible: debugInfo.connectivity.starknetRpc.accessible
	});

	return createSuccessResponse(debugInfo, {
		requestId: crypto.randomUUID()
	});
};

export const GET = withErrorHandling(getDebugHandler, '/api/lightning/debug');
