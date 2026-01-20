/**
 * @fileoverview Estimate Transaction Fee RPC Proxy Endpoint
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ServerRpcService } from '$lib/services/server/rpc.server.service';
import { logger } from '$lib/utils/logger';
import type { Call } from 'starknet';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const clientIP = getClientAddress();
		const body = await request.json();
		const { calls } = body;

		if (!calls || !Array.isArray(calls) || calls.length === 0) {
			return error(400, { message: 'Calls array is required and must be non-empty' });
		}

		// Validate call structure
		for (const call of calls) {
			if (!call.contractAddress || !call.entrypoint || !Array.isArray(call.calldata)) {
				return error(400, {
					message:
						'Invalid call structure. Each call must have contractAddress, entrypoint, and calldata'
				});
			}
		}

		logger.info('Estimating transaction fees via RPC proxy', { callCount: calls.length, clientIP });

		const rpcService = ServerRpcService.getInstance();
		const result = await rpcService.estimateFee(calls as Call[]);

		if (!result.success) {
			logger.error('Failed to estimate transaction fees', undefined, {
				callCount: calls.length,
				resultError: result.error,
				clientIP
			});
			return error(500, { message: result.error || 'Failed to estimate transaction fees' });
		}

		logger.info('Transaction fees estimated successfully', {
			callCount: calls.length,
			feeEstimate: result.data,
			clientIP
		});
		return json({ success: true, data: result.data });
	} catch (err) {
		logger.error(
			'RPC estimate fee endpoint error',
			err instanceof Error ? err : undefined,
			{}
		);
		return error(500, { message: 'Internal server error' });
	}
};
