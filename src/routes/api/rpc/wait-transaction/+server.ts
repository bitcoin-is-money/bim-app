/**
 * @fileoverview Wait for Transaction RPC Proxy Endpoint
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ServerRpcService } from '$lib/services/server/rpc.server.service';
import { logger } from '$lib/utils/logger';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const clientIP = getClientAddress();
		const body = await request.json();
		const { txHash, retryInterval = 2000, maxRetries = 30 } = body;

		if (!txHash || typeof txHash !== 'string') {
			return error(400, { message: 'Transaction hash is required and must be a string' });
		}

		if (typeof retryInterval !== 'number' || retryInterval < 1000 || retryInterval > 10000) {
			return error(400, {
				message: 'Retry interval must be a number between 1000 and 10000 milliseconds'
			});
		}

		if (typeof maxRetries !== 'number' || maxRetries < 1 || maxRetries > 100) {
			return error(400, { message: 'Max retries must be a number between 1 and 100' });
		}

		logger.info('Waiting for transaction via RPC proxy', {
			txHash,
			retryInterval,
			maxRetries,
			clientIP
		});

		const rpcService = ServerRpcService.getInstance();
		const result = await rpcService.waitForTransaction(txHash, retryInterval, maxRetries);

		if (!result.success) {
			logger.error('Failed to wait for transaction', undefined, { txHash, resultError: result.error, clientIP });
			return error(500, { message: result.error || 'Failed to wait for transaction' });
		}

		logger.info('Transaction confirmed successfully', { txHash, receipt: result.data, clientIP });
		return json({ success: true, data: result.data });
	} catch (err) {
		logger.error(
			'RPC wait transaction endpoint error',
			err instanceof Error ? err : undefined,
			{}
		);
		return error(500, { message: 'Internal server error' });
	}
};
