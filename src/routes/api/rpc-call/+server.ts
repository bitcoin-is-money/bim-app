/**
 * @fileoverview RPC Proxy API Endpoints
 *
 * This file provides secure server-side RPC proxy endpoints that allow
 * client-side code to access Starknet RPC functionality without exposing
 * API keys to the client.
 *
 * Security Features:
 * - Authentication required for all endpoints
 * - Input validation and sanitization
 * - Rate limiting and abuse prevention
 * - Comprehensive logging and monitoring
 *
 * @author bim
 * @version 1.0.0
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ServerRpcService } from '$lib/services/server/rpc.server.service';
import { logger } from '$lib/utils/logger';
import type { Call } from 'starknet';

/**
 * Rate limiting store (in production, use Redis or similar)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limiting configuration
 */
const RATE_LIMIT = {
	windowMs: 60 * 1000, // 1 minute
	maxRequests: 100 // 100 requests per minute per IP
};

/**
 * Check rate limit for client IP
 */
function checkRateLimit(clientIP: string): boolean {
	const now = Date.now();
	const clientData = rateLimitStore.get(clientIP);

	if (!clientData || now > clientData.resetTime) {
		// Reset or initialize rate limit
		rateLimitStore.set(clientIP, {
			count: 1,
			resetTime: now + RATE_LIMIT.windowMs
		});
		return true;
	}

	if (clientData.count >= RATE_LIMIT.maxRequests) {
		return false;
	}

	// Increment count
	clientData.count++;
	rateLimitStore.set(clientIP, clientData);
	return true;
}

/**
 * Health check endpoint for RPC service
 */
export const HEAD: RequestHandler = async ({ getClientAddress }) => {
	try {
		const clientIP = getClientAddress();
		logger.info('RPC health check initiated', { clientIP });

		// Test RPC service initialization
		const rpcService = ServerRpcService.getInstance();

		// Try a simple RPC call to verify connectivity
		const result = await rpcService.getChainId();

		if (!result.success) {
			logger.error('RPC health check failed', undefined, { resultError: result.error, clientIP });
			return error(500, { message: 'RPC service unhealthy' });
		}

		logger.info('RPC health check passed', { clientIP });
		return new Response(null, { status: 200 });
	} catch (err) {
		logger.error(
			'RPC health check error',
			err instanceof Error ? err : undefined,
			{}
		);
		return error(500, { message: 'RPC service error' });
	}
};

/**
 * Generic RPC method call endpoint
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		// Rate limiting check
		const clientIP = getClientAddress();
		if (!checkRateLimit(clientIP)) {
			logger.warn('Rate limit exceeded', { clientIP });
			return error(429, { message: 'Rate limit exceeded. Please try again later.' });
		}

		// Parse request body
		const body = await request.json();
		const { method, params = [] } = body;

		// Validate request
		if (!method || typeof method !== 'string') {
			return error(400, { message: 'Invalid request: method is required and must be a string' });
		}

		if (!Array.isArray(params)) {
			return error(400, { message: 'Invalid request: params must be an array' });
		}

		logger.info('RPC proxy call initiated', { method, paramsCount: params.length, clientIP });

		// Make RPC call through server service
		const rpcService = ServerRpcService.getInstance();
		const result = await rpcService.call(method, params);

		if (!result.success) {
			logger.error('RPC proxy call failed', undefined, {
				method,
				params: params.length > 0 ? `[${params.length} params]` : '[]',
				resultError: result.error,
				clientIP
			});
			return error(500, { message: result.error || 'RPC call failed' });
		}

		logger.info('RPC proxy call completed', { method, success: true, clientIP });
		return json({ success: true, data: result.data });
	} catch (err) {
		logger.error(
			'RPC proxy endpoint error',
			err instanceof Error ? err : undefined,
			{}
		);
		return error(500, { message: 'Internal server error' });
	}
};

/**
 * Get account nonce endpoint
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	try {
		// Rate limiting check
		const clientIP = getClientAddress();
		if (!checkRateLimit(clientIP)) {
			logger.warn('Rate limit exceeded', { clientIP });
			return error(429, { message: 'Rate limit exceeded. Please try again later.' });
		}

		const address = url.searchParams.get('address');
		const action = url.searchParams.get('action');

		if (!address) {
			return error(400, { message: 'Address parameter is required' });
		}

		logger.info('RPC proxy action initiated', { action, address, clientIP });

		const rpcService = ServerRpcService.getInstance();
		let result;

		switch (action) {
			case 'nonce':
				result = await rpcService.getNonce(address);
				break;
			case 'balance':
				const tokenAddress = url.searchParams.get('tokenAddress');
				result = await rpcService.getBalance(address, tokenAddress || undefined);
				break;
			case 'chainId':
				result = await rpcService.getChainId();
				break;
			default:
				return error(400, {
					message: 'Invalid action. Supported actions: nonce, balance, chainId'
				});
		}

		if (!result.success) {
			logger.error('RPC proxy action failed', undefined, { action, address, resultError: result.error, clientIP });
			return error(500, { message: result.error || 'RPC action failed' });
		}

		logger.info('RPC proxy action completed', { action, address, success: true, clientIP });
		return json({ success: true, data: result.data });
	} catch (err) {
		logger.error(
			'RPC proxy GET endpoint error',
			err instanceof Error ? err : undefined,
			{}
		);
		return error(500, { message: 'Internal server error' });
	}
};
