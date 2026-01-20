/**
 * @fileoverview Server-side RPC Service
 *
 * This service provides secure server-side access to Starknet RPC endpoints.
 * It ensures that RPC API keys never leave the server and provides a clean
 * interface for RPC operations.
 *
 * Key Features:
 * - Secure RPC access with private API keys
 * - Centralized error handling and logging
 * - Connection pooling and caching
 * - Input validation and sanitization
 *
 * @author bim
 * @version 1.0.0
 */

import { PublicEnv } from '$lib/config/env';
import { ServerPrivateEnv } from '$lib/config/server';
import { logger } from '$lib/utils/logger';
import { RpcProvider, type Call, type FeeEstimate, type TransactionReceipt } from 'starknet';

/**
 * RPC method call parameters
 */
export interface RpcCallParams {
	method: string;
	params: any[];
}

/**
 * RPC service response wrapper
 */
export interface RpcResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Server-side RPC service for secure Starknet operations
 */
export class ServerRpcService {
	private static instance: ServerRpcService;
	private provider: RpcProvider;

	private constructor() {
		try {
			// Get RPC URL from server environment
			const rpcUrl = ServerPrivateEnv.STARKNET_RPC_URL();
			const specVersion = PublicEnv.STARKNET_SPEC_VERSION() as '0.9.0';

			logger.info('Initializing ServerRpcService', {
				rpcUrl: rpcUrl ? `${rpcUrl.substring(0, 20)}...` : 'undefined',
				specVersion
			});

			// Validate RPC URL
			if (!rpcUrl) {
				throw new Error('STARKNET_RPC_URL environment variable is not set');
			}

			if (!rpcUrl.startsWith('http')) {
				throw new Error(`Invalid RPC URL format: ${rpcUrl}`);
			}

			// Initialize provider with server-side RPC URL (contains API key)
			this.provider = new RpcProvider({
				nodeUrl: rpcUrl,
				specVersion: specVersion
			});

			logger.info('ServerRpcService initialized successfully');
		} catch (error) {
			logger.error(
				'Failed to initialize ServerRpcService',
				error instanceof Error ? error : undefined,
				{
					errorMessage: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
					rpcUrl: process.env.STARKNET_RPC_URL ? 'set' : 'not set',
					specVersion: process.env.STARKNET_SPEC_VERSION || 'not set'
				}
			);
			throw error;
		}
	}

	static getInstance(): ServerRpcService {
		if (!ServerRpcService.instance) {
			ServerRpcService.instance = new ServerRpcService();
		}
		return ServerRpcService.instance;
	}

	/**
	 * Generic RPC method call
	 */
	async call(method: string, params: any[] = []): Promise<RpcResponse> {
		try {
			logger.debug('RPC call initiated', { method, paramsCount: params.length });

			// Validate method name (basic security check)
			if (!this.isValidRpcMethod(method)) {
				throw new Error(`Invalid RPC method: ${method}`);
			}

			// Check if provider is initialized
			if (!this.provider) {
				throw new Error('RPC provider is not initialized');
			}

			// Route to specific provider methods or make raw HTTP call
			let result: any;

			switch (method) {
				case 'starknet_getClassHashAt':
					result = await this.provider.getClassHashAt(params[0]);
					break;
				case 'starknet_call':
					result = await this.provider.callContract({
						contractAddress: params[0].contract_address,
						entrypoint: params[0].entry_point_selector,
						calldata: params[0].calldata || []
					});
					break;
				case 'starknet_getNonce':
					result = await this.provider.getNonce(params[0]);
					break;
				case 'starknet_getBalance':
					result = await this.provider.getBalance(params[0], params[1]);
					break;
				case 'starknet_chainId':
					result = await this.provider.getChainId();
					break;
				case 'starknet_getTransactionReceipt':
					result = await this.provider.getTransactionReceipt(params[0]);
					break;
				case 'starknet_estimateFee':
					result = await this.provider.estimateFee(params[0]);
					break;
				case 'starknet_waitForTransaction':
					result = await this.provider.waitForTransaction(params[0], params[1], params[2]);
					break;
				default:
					// For other methods, make a raw HTTP call
					result = await this.makeRawRpcCall(method, params);
			}

			logger.debug('RPC call completed', { method, success: true });
			return { success: true, data: result };
		} catch (error) {
			logger.error(
				'RPC call failed',
				error instanceof Error ? error : undefined,
				{
					method,
					params: params.length > 0 ? `[${params.length} params]` : '[]',
					errorMessage: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined
				}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown RPC error'
			};
		}
	}

	/**
	 * Make raw HTTP RPC call for methods not directly supported by provider
	 */
	private async makeRawRpcCall(method: string, params: any[]): Promise<any> {
		const rpcUrl = ServerPrivateEnv.STARKNET_RPC_URL();

		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method,
				params
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		if (data.error) {
			throw new Error(`RPC Error: ${data.error.message}`);
		}

		return data.result;
	}

	/**
	 * Get account nonce
	 */
	async getNonce(address: string): Promise<RpcResponse<string>> {
		try {
			logger.info('Getting account nonce', { address });

			logger.info('Calling provider.getNonceForAddress', {
				address,
				providerType: typeof this.provider
			});
			const nonce = await this.provider.getNonceForAddress(address);

			logger.debug('Account nonce retrieved', { address, nonce });
			return { success: true, data: nonce };
		} catch (error) {
			logger.error(
				'Failed to get account nonce',
				error instanceof Error ? error : undefined,
				{
					address,
					errorMessage: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
					providerType: typeof this.provider,
					hasProvider: !!this.provider
				}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get account nonce'
			};
		}
	}

	/**
	 * Get account nonce for address
	 */
	async getNonceforAddress(address: string): Promise<RpcResponse<string>> {
		try {
			logger.info('Getting account nonce for address', { address });

			const nonce = await this.provider.getNonceForAddress(address);

			logger.debug('Account nonce for address retrieved', { address, nonce });
			return { success: true, data: nonce };
		} catch (error) {
			logger.error(
				'Failed to get account nonce for address',
				error instanceof Error ? error : undefined,
				{
					address,
					errorMessage: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
					providerType: typeof this.provider,
					hasProvider: !!this.provider
				}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get account nonce for address'
			};
		}
	}

	/**
	 * Get account balance
	 */
	async getBalance(address: string, tokenAddress?: string): Promise<RpcResponse<string>> {
		try {
			logger.debug('Getting account balance', { address, tokenAddress });

			let balance: string;
			if (tokenAddress) {
				// ERC-20 token balance
				balance = await this.provider.getBalance(address, tokenAddress);
			} else {
				// Native token balance (ETH)
				balance = await this.provider.getBalance(address);
			}

			logger.debug('Account balance retrieved', { address, tokenAddress, balance });
			return { success: true, data: balance };
		} catch (error) {
			logger.error(
				'Failed to get account balance',
				error instanceof Error ? error : undefined,
				{
					address,
					tokenAddress
				}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get account balance'
			};
		}
	}

	/**
	 * Estimate transaction fees
	 */
	async estimateFee(calls: Call[]): Promise<RpcResponse<FeeEstimate>> {
		try {
			logger.debug('Estimating transaction fees', { callCount: calls.length });

			// Validate calls
			if (!Array.isArray(calls) || calls.length === 0) {
				throw new Error('Invalid calls array');
			}

			// Validate each call
			for (const call of calls) {
				if (!this.isValidCall(call)) {
					throw new Error(`Invalid call structure: ${JSON.stringify(call)}`);
				}
			}

			const feeEstimate = await this.provider.estimateFee(calls);

			logger.debug('Transaction fees estimated', { callCount: calls.length, feeEstimate });
			return { success: true, data: feeEstimate };
		} catch (error) {
			logger.error(
				'Failed to estimate transaction fees',
				error instanceof Error ? error : undefined,
				{
					callCount: calls.length
				}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to estimate transaction fees'
			};
		}
	}

	/**
	 * Wait for transaction confirmation
	 */
	async waitForTransaction(
		txHash: string,
		retryInterval = 2000,
		maxRetries = 30
	): Promise<RpcResponse<TransactionReceipt>> {
		try {
			logger.debug('Waiting for transaction confirmation', { txHash, retryInterval, maxRetries });

			const receipt = await this.provider.waitForTransaction(txHash, retryInterval, maxRetries);

			logger.debug('Transaction confirmed', { txHash, receipt });
			return { success: true, data: receipt };
		} catch (error) {
			logger.error(
				'Failed to wait for transaction',
				error instanceof Error ? error : undefined,
				{
					txHash
				}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to wait for transaction'
			};
		}
	}

	/**
	 * Fast wait for transaction confirmation (starknet.js fastWaitForTransaction)
	 *
	 * This method is optimized for checking if the next transaction can be sent
	 * for a specific account. Returns boolean instead of transaction receipt.
	 */
	async fastWaitForTransaction(
		txHash: string,
		address: string,
		initialNonce: string
	): Promise<RpcResponse<boolean>> {
		try {
			logger.debug('Fast waiting for transaction confirmation', { txHash, address, initialNonce });

			// Check if provider supports fastWaitForTransaction (RPC 0.9+)
			if (typeof this.provider.fastWaitForTransaction !== 'function') {
				logger.warn('Provider does not have fastWaitForTransaction method', {
					providerType: typeof this.provider,
					providerConstructor: this.provider.constructor?.name,
					hasMethod: 'fastWaitForTransaction' in this.provider,
					providerKeys: Object.keys(this.provider).slice(0, 10)
				});
				return {
					success: false,
					error: 'Provider does not support fastWaitForTransaction (requires RPC 0.9+)'
				};
			}

			// BigNumberish accepts string, number, or BigInt - string "0" should work fine
			logger.debug('Calling fastWaitForTransaction', { txHash, address, initialNonce });
			const canSendNext = await this.provider.fastWaitForTransaction(txHash, address, initialNonce);

			logger.debug('Fast wait for transaction completed', { txHash, address, canSendNext });
			return { success: true, data: canSendNext };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			
			// Log with both structured logging and console for visibility
			logger.error(
				'Failed to fast wait for transaction',
				error instanceof Error ? error : undefined,
				{
					txHash,
					address,
					initialNonce,
					errorMessage,
					errorStack,
					providerType: typeof this.provider,
					hasFastWaitMethod: typeof this.provider.fastWaitForTransaction === 'function',
					providerConstructor: this.provider.constructor?.name
				}
			);
			
			// Also log to console for immediate visibility
			console.error('[fastWaitForTransaction] Error details:', {
				errorMessage,
				errorStack,
				txHash,
				address,
				initialNonce,
				hasMethod: typeof this.provider.fastWaitForTransaction === 'function'
			});
			
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Get transaction receipt
	 */
	async getTransactionReceipt(txHash: string): Promise<RpcResponse<TransactionReceipt>> {
		try {
			logger.debug('Getting transaction receipt', { txHash });

			const receipt = await this.provider.getTransactionReceipt(txHash);

			logger.debug('Transaction receipt retrieved', { txHash, receipt });
			return { success: true, data: receipt };
		} catch (error) {
			logger.error(
				'Failed to get transaction receipt',
				error instanceof Error ? error : undefined,
				{
					txHash
				}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get transaction receipt'
			};
		}
	}

	/**
	 * Get chain ID
	 */
	async getChainId(): Promise<RpcResponse<string>> {
		try {
			logger.debug('Getting chain ID');

			const chainId = await this.provider.getChainId();

			logger.debug('Chain ID retrieved', { chainId });
			return { success: true, data: chainId };
		} catch (error) {
			logger.error(
				'Failed to get chain ID',
				error instanceof Error ? error : undefined,
				{}
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get chain ID'
			};
		}
	}

	/**
	 * Validate RPC method name (security check)
	 */
	private isValidRpcMethod(method: string): boolean {
		// Allow only specific RPC methods for security
		const allowedMethods = [
			'starknet_getNonce',
			'starknet_getBalance',
			'starknet_estimateFee',
			'starknet_waitForTransaction',
			'starknet_getTransactionReceipt',
			'starknet_chainId',
			'starknet_call',
			'starknet_getClass',
			'starknet_getClassAt',
			'starknet_getClassHashAt',
			'starknet_getStorageAt',
			'starknet_getTransactionByHash',
			'starknet_getTransactionByBlockIdAndIndex',
			'starknet_getBlockTransactionCount',
			'starknet_getBlockWithTxHashes',
			'starknet_getBlockWithTxs',
			'starknet_getBlockNumber',
			'starknet_getBlockHashAndNumber',
			'starknet_getStateUpdate',
			'starknet_syncing'
		];

		return allowedMethods.includes(method);
	}

	/**
	 * Validate call structure
	 */
	private isValidCall(call: any): boolean {
		return (
			call &&
			typeof call === 'object' &&
			typeof call.contractAddress === 'string' &&
			typeof call.entrypoint === 'string' &&
			Array.isArray(call.calldata)
		);
	}
}
