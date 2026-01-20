/**
 * @fileoverview Fast Wait for Transaction RPC Proxy Endpoint
 *
 * This endpoint provides access to the fastWaitForTransaction method from starknet.js
 * which is optimized for checking if the next transaction can be sent for an account.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ServerRpcService } from '$lib/services/server/rpc.server.service';
import { logger } from '$lib/utils/logger';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const clientIP = getClientAddress();
		const body = await request.json();
		const { txHash, address, initialNonce } = body;

		if (!txHash || typeof txHash !== 'string') {
			return error(400, { message: 'Transaction hash is required and must be a string' });
		}

		if (!address || typeof address !== 'string') {
			return error(400, { message: 'Account address is required and must be a string' });
		}

		if (initialNonce === undefined || typeof initialNonce !== 'string') {
			return error(400, { message: 'Initial nonce is required and must be a string' });
		}

		logger.info('Fast waiting for transaction via RPC proxy', {
			txHash,
			address,
			initialNonce,
			clientIP
		});

		const rpcService = ServerRpcService.getInstance();
		const result = await rpcService.fastWaitForTransaction(txHash, address, initialNonce);

		if (!result.success) {
			const errorMsg = result.error || 'Failed to fast wait for transaction';
			logger.error('Failed to fast wait for transaction', undefined, {
				txHash,
				address,
				initialNonce,
				resultError: result.error,
				clientIP
			});
			console.error('[fast-wait-transaction endpoint] Error:', {
				txHash,
				address,
				initialNonce,
				error: errorMsg,
				clientIP
			});
			return error(500, { message: errorMsg });
		}

		logger.info('Fast wait for transaction completed', {
			txHash,
			address,
			canSendNext: result.data,
			clientIP
		});
		return json({ success: true, data: result.data });
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		const errorStack = err instanceof Error ? err.stack : undefined;
		
		logger.error(
			'RPC fast wait transaction endpoint error',
			err instanceof Error ? err : undefined,
			{
				errorMessage: errorMsg,
				errorStack,
				errorName: err instanceof Error ? err.name : undefined
			}
		);
		
		console.error('[fast-wait-transaction endpoint] Unexpected error:', {
			errorMessage: errorMsg,
			errorStack,
			errorName: err instanceof Error ? err.name : undefined
		});
		
		return error(500, { 
			message: errorMsg
		});
	}
};
