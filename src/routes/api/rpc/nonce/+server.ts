/**
 * @fileoverview Get Account Nonce RPC Proxy Endpoint
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ServerRpcService } from '$lib/services/server/rpc.server.service';
import { logger } from '$lib/utils/logger';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const clientIP = getClientAddress();
		const body = await request.json();
		const { address } = body;

		if (!address || typeof address !== 'string') {
			return error(400, { message: 'Address is required and must be a string' });
		}

		logger.info('Getting account nonce via RPC proxy', { address, clientIP });

		let rpcService;
		try {
			rpcService = ServerRpcService.getInstance();
		} catch (error) {
			logger.error(
				'Failed to get ServerRpcService instance',
				error instanceof Error ? error : undefined,
				{
					stack: error instanceof Error ? error.stack : undefined
				}
			);
			return error(500, { message: 'RPC service initialization failed' });
		}

		const result = await rpcService.getNonce(address);

		if (!result.success) {
			logger.error('Failed to get account nonce', undefined, { address, resultError: result.error, clientIP });
			return error(500, { message: result.error || 'Failed to get account nonce' });
		}

		logger.info('Account nonce retrieved successfully', { address, nonce: result.data, clientIP });
		return json({ success: true, data: result.data });
	} catch (err) {
		logger.error(
			'RPC nonce endpoint error',
			err instanceof Error ? err : undefined,
			{}
		);
		return error(500, { message: 'Internal server error' });
	}
};
