import { logger } from '$lib/utils/logger';
import { serviceConfig } from '$lib/config/index';
import type { AtomiqConfig } from '../types';
import { getConfig } from '../config';

export class AtomiqConfigService {
	private static instance: AtomiqConfigService;
	private config: AtomiqConfig;

	private constructor(config?: AtomiqConfig) {
		this.config = config || getConfig();
		this.validateConfig();
	}

	static getInstance(config?: AtomiqConfig): AtomiqConfigService {
		if (!AtomiqConfigService.instance) {
			AtomiqConfigService.instance = new AtomiqConfigService(config);
		}
		return AtomiqConfigService.instance;
	}

	private validateConfig(): void {
		if (!this.config.starknetRpcUrl) {
			throw new Error(
				'STARKNET_RPC_URL is required for Atomiq SDK initialization. Please set this environment variable.'
			);
		}

		if (
			!this.config.starknetRpcUrl.startsWith('http://') &&
			!this.config.starknetRpcUrl.startsWith('https://')
		) {
			throw new Error(
				`STARKNET_RPC_URL must be a valid HTTP/HTTPS URL. Current value: ${this.config.starknetRpcUrl}`
			);
		}

		// Validate Bitcoin network
		if (!['mainnet', 'testnet'].includes(this.config.bitcoinNetwork)) {
			throw new Error(
				`Invalid Bitcoin network: ${this.config.bitcoinNetwork}. Must be 'mainnet' or 'testnet'`
			);
		}

		// Check if RPC URL looks like it's compatible with v0.9
		if (this.config.starknetRpcUrl.includes('/rpc/v0_8')) {
			logger.warn(
				'STARKNET_RPC_URL appears to be using v0.8 endpoint. Consider upgrading to v0.9 for better compatibility.',
				{
					currentUrl: this.config.starknetRpcUrl?.substring(0, 50) + '...'
				}
			);
		}

		logger.info('AtomiqConfigService configuration validated', {
			bitcoinNetwork: this.config.bitcoinNetwork,
			timeout: this.config.timeout,
			starknetRpcUrl: this.config.starknetRpcUrl?.substring(0, 50) + '...',
			hasIntermediaryUrls: !!(
				this.config.intermediaryUrls && this.config.intermediaryUrls.length > 0
			),
			intermediaryUrlCount: this.config.intermediaryUrls ? this.config.intermediaryUrls.length : 0
		});
	}

	async testConnectivity(): Promise<void> {
		const startTime = Date.now();

		try {
			logger.info('Testing Starknet RPC connectivity...', {
				rpcUrl: this.config.starknetRpcUrl?.substring(0, 50) + '...',
				timeout: 10000
			});

			// Create AbortController for timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			try {
				const testResponse = await fetch(this.config.starknetRpcUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': 'AtomiqService/1.0'
					},
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'starknet_chainId',
						params: [],
						id: 1
					}),
					signal: controller.signal
				});

				clearTimeout(timeoutId);

				const responseTime = Date.now() - startTime;

				if (!testResponse.ok) {
					throw new Error(
						`RPC test failed with status: ${testResponse.status} ${testResponse.statusText}`
					);
				}

				// Try to parse the response to validate it's proper JSON-RPC
				let responseData;
				try {
					responseData = await testResponse.json();
				} catch (parseError) {
					throw new Error(
						`RPC response is not valid JSON: ${parseError instanceof Error ? parseError.message : 'unknown'}`
					);
				}

				// Validate JSON-RPC response format
				if (!responseData.jsonrpc || responseData.jsonrpc !== '2.0') {
					throw new Error('RPC response is not valid JSON-RPC 2.0 format');
				}

				if (responseData.error) {
					throw new Error(
						`RPC returned error: ${responseData.error.message || 'unknown RPC error'}`
					);
				}

				if (!responseData.result) {
					logger.warn('RPC response missing result field', { responseData });
				}

				logger.info('Starknet RPC connectivity test passed', {
					responseTime: `${responseTime}ms`,
					chainId: responseData.result || 'unknown',
					status: testResponse.status
				});
			} finally {
				clearTimeout(timeoutId);
			}
		} catch (rpcError) {
			const responseTime = Date.now() - startTime;
			const errorMessage = rpcError instanceof Error ? rpcError.message : 'unknown error';

			logger.error('Starknet RPC connectivity test failed', rpcError as Error, {
				rpcUrl: this.config.starknetRpcUrl?.substring(0, 50) + '...',
				responseTime: `${responseTime}ms`,
				errorMessage,
				errorType: this.categorizeRpcError(errorMessage)
			});

			// Provide specific error guidance but don't fail initialization
			if (errorMessage.includes('abort')) {
				logger.warn('RPC connectivity test timed out - service may be slow or unavailable');
			} else if (errorMessage.includes('fetch')) {
				logger.warn('RPC connectivity test failed - network issue or invalid URL');
			} else if (errorMessage.includes('JSON')) {
				logger.warn('RPC connectivity test failed - invalid response format');
			} else if (errorMessage.includes('status')) {
				logger.warn('RPC connectivity test failed - server returned error status');
			}

			// Continue as RPC might be temporarily unavailable
			logger.info('Continuing with initialization despite RPC connectivity issues');
		}
	}

	private categorizeRpcError(errorMessage: string): string {
		if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
			return 'timeout';
		} else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
			return 'network';
		} else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
			return 'response_format';
		} else if (errorMessage.includes('status') || errorMessage.includes('4')) {
			return 'http_error';
		} else if (errorMessage.includes('jsonrpc') || errorMessage.includes('rpc')) {
			return 'rpc_protocol';
		}
		return 'unknown';
	}

	getConfig(): AtomiqConfig {
		return { ...this.config };
	}

	getBitcoinNetwork(): string {
		return this.config.bitcoinNetwork;
	}

	getStarknetRpcUrl(): string {
		return this.config.starknetRpcUrl;
	}

	getTimeout(): number {
		return this.config.timeout;
	}
}
