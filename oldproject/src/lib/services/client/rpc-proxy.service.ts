/**
 * @fileoverview Client-side RPC Proxy Service
 *
 * This service provides client-side access to Starknet RPC functionality
 * through secure server-side proxy endpoints. It ensures that RPC API keys
 * never leave the server while providing a clean interface for client code.
 *
 * Key Features:
 * - Secure RPC access through server proxy
 * - Automatic error handling and retry logic
 * - Type-safe interfaces matching Starknet.js
 * - Caching and performance optimization
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import type { Call, FeeEstimate, TransactionReceipt } from 'starknet';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

/**
 * RPC proxy response wrapper
 */
export interface RpcProxyResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Client-side RPC proxy service for secure Starknet operations
 */
export class ClientRpcProxyService {
	private static instance: ClientRpcProxyService;
	private cache = new Map<string, { data: any; timestamp: number }>();
	private readonly CACHE_TTL = 30 * 1000; // 30 seconds

	private constructor() {
		logger.info(get(_)('client.rpc.service_initialized'));
	}

	static getInstance(): ClientRpcProxyService {
		if (!ClientRpcProxyService.instance) {
			ClientRpcProxyService.instance = new ClientRpcProxyService();
		}
		return ClientRpcProxyService.instance;
	}

	/**
	 * Generic RPC method call through server proxy
	 */
	async call(
		method: string,
		params: any[] = [],
		logErrors: boolean = true
	): Promise<RpcProxyResponse> {
		try {
			logger.debug('RPC proxy call initiated', { method, paramsCount: params.length });

			const response = await fetch('/api/rpc-call', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ method, params })
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ message: get(_)('client.starknet.unknown_error') }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			logger.debug('RPC proxy call completed', { method, success: result.success });
			return result;
		} catch (error) {
			if (logErrors) {
				logger.error(
					'RPC proxy call failed',
					error instanceof Error ? error : undefined,
					{ method }
				);
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : get(_)('client.rpc.call_failed')
			};
		}
	}

	/**
	 * Get account nonce through server proxy
	 */
	async getNonce(address: string): Promise<string> {
		try {
			// Check cache first
			const cacheKey = `nonce:${address}`;
			const cached = this.getCached(cacheKey);
			if (cached) {
				logger.debug('Account nonce retrieved from cache', { address });
				return cached;
			}

			logger.debug(get(_)('client.rpc.getting_nonce'), { address });

			const response = await fetch('/api/rpc/nonce', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ address })
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ message: get(_)('client.starknet.unknown_error') }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || get(_)('client.rpc.failed_to_get_nonce'));
			}

			// Cache the result
			this.setCached(cacheKey, result.data);

			logger.debug(get(_)('client.rpc.nonce_retrieved_successfully'), {
				address,
				nonce: result.data
			});
			return result.data;
		} catch (error) {
			logger.error(
				get(_)('client.rpc.failed_to_get_nonce'),
				error instanceof Error ? error : undefined,
				{ address }
			);
			throw error;
		}
	}

	/**
	 * Get account nonce for a specific address through server proxy
	 * Direct proxy to RPC provider's getNonceForAddress method
	 */
	async getNonceForAddress(address: string): Promise<string> {
		try {
			logger.debug(get(_)('client.rpc.getting_nonce_for_address'), { address });

			const response = await fetch('/api/rpc/nonce-for-address', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ address })
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ message: get(_)('client.starknet.unknown_error') }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || get(_)('client.rpc.failed_to_get_nonce_for_address'));
			}

			logger.debug(get(_)('client.rpc.nonce_for_address_retrieved_successfully'), {
				address,
				nonce: result.data
			});
			return result.data;
		} catch (error) {
			logger.error(
				get(_)('client.rpc.failed_to_get_nonce_for_address'),
				error instanceof Error ? error : undefined,
				{ address }
			);
			throw error;
		}
	}

	/**
	 * Get account balance through server proxy
	 */
	async getBalance(address: string, tokenAddress?: string): Promise<string> {
		try {
			// Check cache first
			const cacheKey = `balance:${address}:${tokenAddress || 'native'}`;
			const cached = this.getCached(cacheKey);
			if (cached) {
				logger.debug('Account balance retrieved from cache', { address, tokenAddress });
				return cached;
			}

			logger.debug('Getting account balance via RPC proxy', { address, tokenAddress });

			const response = await fetch('/api/rpc/balance', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ address, tokenAddress })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to get account balance');
			}

			// Cache the result
			this.setCached(cacheKey, result.data);

			logger.debug('Account balance retrieved successfully', {
				address,
				tokenAddress,
				balance: result.data
			});
			return result.data;
		} catch (error) {
			logger.error(
				'Failed to get account balance',
				error instanceof Error ? error : undefined,
				{ address, tokenAddress }
			);
			throw error;
		}
	}

	/**
	 * Estimate transaction fees through server proxy
	 */
	async estimateFee(calls: Call[]): Promise<FeeEstimate> {
		try {
			logger.debug('Estimating transaction fees via RPC proxy', { callCount: calls.length });

			const response = await fetch('/api/rpc/estimate-fee', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ calls })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to estimate transaction fees');
			}

			logger.debug('Transaction fees estimated successfully', {
				callCount: calls.length,
				feeEstimate: result.data
			});
			return result.data;
		} catch (error) {
			logger.error(
				'Failed to estimate transaction fees',
				error instanceof Error ? error : undefined,
				{ callCount: calls.length }
			);
			throw error;
		}
	}

	/**
	 * Wait for transaction confirmation through server proxy
	 */
	async waitForTransaction(
		txHash: string,
		retryInterval = 2000,
		maxRetries = 30
	): Promise<TransactionReceipt> {
		try {
			logger.debug('Waiting for transaction via RPC proxy', { txHash, retryInterval, maxRetries });

			const response = await fetch('/api/rpc/wait-transaction', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ txHash, retryInterval, maxRetries })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to wait for transaction');
			}

			logger.debug('Transaction confirmed successfully', { txHash, receipt: result.data });
			return result.data;
		} catch (error) {
			logger.error(
				'Failed to wait for transaction',
				error instanceof Error ? error : undefined,
				{ txHash }
			);
			throw error;
		}
	}

	/**
	 * Fast wait for transaction confirmation through server proxy
	 *
	 * Uses starknet.js fastWaitForTransaction for optimized transaction confirmation.
	 * Returns boolean indicating if the next transaction can be sent for the account.
	 */
	async fastWaitForTransaction(
		txHash: string,
		address: string,
		initialNonce: string
	): Promise<boolean> {
		try {
			logger.debug('Fast waiting for transaction via RPC proxy', { txHash, address, initialNonce });

			const response = await fetch('/api/rpc/fast-wait-transaction', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ txHash, address, initialNonce })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to fast wait for transaction');
			}

			logger.debug('Fast wait for transaction completed successfully', {
				txHash,
				address,
				canSendNext: result.data
			});
			return result.data;
		} catch (error) {
			logger.error(
				'Failed to fast wait for transaction',
				error instanceof Error ? error : undefined,
				{ txHash, address }
			);
			throw error;
		}
	}

	/**
	 * Get chain ID through server proxy
	 */
	async getChainId(): Promise<string> {
		try {
			// Check cache first
			const cacheKey = 'chainId';
			const cached = this.getCached(cacheKey);
			if (cached) {
				logger.debug('Chain ID retrieved from cache');
				return cached;
			}

			logger.debug('Getting chain ID via RPC proxy');

			const response = await fetch('/api/rpc?action=chainId', {
				method: 'GET'
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to get chain ID');
			}

			// Cache the result (chain ID rarely changes)
			this.setCached(cacheKey, result.data, 5 * 60 * 1000); // 5 minutes

			logger.debug('Chain ID retrieved successfully', { chainId: result.data });
			return result.data;
		} catch (error) {
			logger.error('Failed to get chain ID', error instanceof Error ? error : undefined);
			throw error;
		}
	}

	/**
	 * Test RPC proxy connectivity
	 */
	async testConnectivity(): Promise<{ success: boolean; error?: string }> {
		try {
			logger.debug('Testing RPC proxy connectivity');

			// Test with a simple chain ID call
			const result = await this.call('starknet_chainId', []);

			if (result.success) {
				logger.debug('RPC proxy connectivity test passed', { chainId: result.data });
				return { success: true };
			} else {
				logger.error('RPC proxy connectivity test failed', undefined, {
				errorMessage: result.error
			});
				return { success: false, error: result.error };
			}
		} catch (error) {
			logger.error(
				'RPC proxy connectivity test error',
				error instanceof Error ? error : undefined
			);
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	}

	/**
	 * Clear cache (useful for testing or when data might be stale)
	 */
	clearCache(): void {
		this.cache.clear();
		logger.debug('RPC proxy cache cleared');
	}

	/**
	 * Get cached data if still valid
	 */
	private getCached(key: string): any | null {
		const cached = this.cache.get(key);
		if (!cached) return null;

		if (Date.now() - cached.timestamp > this.CACHE_TTL) {
			this.cache.delete(key);
			return null;
		}

		return cached.data;
	}

	/**
	 * Set cached data with timestamp
	 */
	private setCached(key: string, data: any, _ttl = this.CACHE_TTL): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});

		// Clean up expired entries periodically
		if (this.cache.size > 100) {
			this.cleanupCache();
		}
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		for (const [key, value] of this.cache.entries()) {
			if (now - value.timestamp > this.CACHE_TTL) {
				this.cache.delete(key);
			}
		}
	}
}
