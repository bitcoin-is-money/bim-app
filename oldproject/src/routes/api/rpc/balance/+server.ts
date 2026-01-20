/**
 * @fileoverview Get Account Balance RPC Proxy Endpoint
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ServerRpcService } from '$lib/services/server/rpc.server.service';
import { logger } from '$lib/utils/logger';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const clientIP = getClientAddress();
		const body = await request.json();
		const { address, tokenAddress } = body;

		if (!address || typeof address !== 'string') {
			return error(400, { message: 'Address is required and must be a string' });
		}

		if (tokenAddress && typeof tokenAddress !== 'string') {
			return error(400, { message: 'Token address must be a string if provided' });
		}

		logger.info('Getting account balance via RPC proxy', { address, tokenAddress, clientIP });

		const rpcService = ServerRpcService.getInstance();
		const result = await rpcService.getBalance(address, tokenAddress);

		if (!result.success) {
			logger.error('Failed to get account balance', {
				address,
				tokenAddress,
				error: result.error,
				clientIP
			});
			return error(500, { message: result.error || 'Failed to get account balance' });
		}

		logger.info('Account balance retrieved successfully', {
			address,
			tokenAddress,
			balance: result.data,
			clientIP
		});
		return json({ success: true, data: result.data });
	} catch (err) {
		logger.error('RPC balance endpoint error', {
			error: err instanceof Error ? err.message : 'Unknown error'
		});
		return error(500, { message: 'Internal server error' });
	}
};
