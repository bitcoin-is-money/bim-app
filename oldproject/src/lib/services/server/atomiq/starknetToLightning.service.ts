/**
 * @fileoverview Starknet to Lightning Swaps Service for Atomiq
 *
 * This service handles Starknet to Lightning Network swaps using the Atomiq SDK,
 * including reverse swap creation and Lightning invoice processing.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import { handleStarknetToLightningSwapError } from './error-handlers';
import { SDKInitializerService } from './initialization/sdk-initializer.service';
import type { StarknetToLightningSwapRequest, StarknetToLightningSwapResponse } from './types';
import { SWAP_STATE_MAP, TOKEN_MAP } from './types';

/**
 * Service for Starknet to Lightning Network swaps
 */
export class StarknetToLightningService {
	constructor(
		private config: any,
		private swapperFactory: any,
		private swapper: any
	) {
		logger.info('StarknetToLightningService initialized');
	}

	/**
	 * Creates a Starknet to Lightning Network swap
	 */
	async createStarknetToLightningSwap(
		request: StarknetToLightningSwapRequest
	): Promise<StarknetToLightningSwapResponse & { swapObject?: any }> {
		try {
			logger.info('Creating Starknet to Lightning swap with real Atomiq SDK', {
				sourceAsset: request.sourceAsset,
				starknetAddress: request.starknetAddress.substring(0, 10) + '...',
				lightningAddress: request.lightningAddress.substring(0, 20) + '...',
				amountInSats: request.amountInSats,
				hasSwapper: !!this.swapper,
				hasSwapperFactory: !!this.swapperFactory
			});

			// Validate SDK state before proceeding
			this.validateSDKState();

			// Force SDK initialization if tokens are not available
			await this.ensureSDKInitialized();

			// Get source and destination tokens
			const { sourceToken, destToken } = await this.getTokensForSwap(request.sourceAsset);

			logger.info('About to create reverse swap with SDK', {
				sourceAsset: request.sourceAsset,
				starknetAddress: request.starknetAddress.substring(0, 10) + '...',
				lightningAddress: request.lightningAddress,
				amountInSats: request.amountInSats,
				hasSourceToken: !!sourceToken,
				hasDestToken: !!destToken
			});

			const Tokens = this.swapperFactory.Tokens;

			// Create reverse swap with real SDK - Starknet asset to Lightning BTC
			// For swaps TO Lightning, amount should be undefined as it's determined by the Lightning invoice
			const swap = await this.createSwapWithTimeout(
				sourceToken, // Source token (Starknet asset)
				Tokens.BITCOIN.BTCLN, // Destination token (BTC Lightning)
				request.starknetAddress, // Source address (Starknet address to send from)
				request.lightningAddress // Destination Lightning invoice/address
			);

			if (!swap) {
				throw new Error('SDK returned null/undefined swap object');
			}

			logger.info('SDK reverse swap created successfully', {
				swapId: swap.getId(),
				swapState: swap.getState(),
				hasGetAddress: typeof swap.getAddress === 'function'
			});

			// Log all available methods on the swap object for debugging
			const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(swap)).filter(
				(name) => typeof swap[name] === 'function'
			);

			logger.info('Available methods on swap object', {
				swapId: swap.getId(),
				availableMethods
			});

			// Get Starknet address to send assets to
			const starknetDepositAddress = await this.getSwapAddress(swap);
			const swapId = swap.getId();
			const swapState = swap.getState();

			// Use user-provided amount as estimated output
			const estimatedOutput = request.amountInSats;

			// Calculate fees
			const fees = this.calculateFees(estimatedOutput);

			// Create response
			const response: StarknetToLightningSwapResponse = {
				swapId,
				starknetAddress: starknetDepositAddress,
				estimatedOutput,
				fees,
				status: this.mapSwapState(swapState),
				expiresAt: new Date(Date.now() + (request.expirationMinutes || 60) * 60 * 1000)
			};

			logger.info('Starknet to Lightning swap created successfully', {
				swapId,
				starknetAddress: starknetDepositAddress,
				estimatedOutput,
				status: response.status
			});

			// Return both the response and the swap object for proper integration
			return {
				...response,
				swapObject: swap
			};
		} catch (error) {
			handleStarknetToLightningSwapError(error, request);
		}
	}

	/**
	 * Create swap with timeout protection
	 */
	private async createSwapWithTimeout(
		sourceToken: any,
		destToken: any,
		starknetAddress: string,
		lightningAddress: string
	): Promise<any> {
		const TIMEOUT_MS = 90000; // 90 seconds timeout for swap creation

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error('Swap creation timed out after 90 seconds'));
			}, TIMEOUT_MS);

			this.swapper
				.swap(
					sourceToken,
					destToken,
					undefined, // Amount is determined by the Lightning invoice, not user input
					false, // exactIn=false for swaps TO Lightning Network
					starknetAddress,
					lightningAddress
				)
				.then((swap: any) => {
					clearTimeout(timeoutId);
					resolve(swap);
				})
				.catch((error: Error) => {
					clearTimeout(timeoutId);
					reject(error);
				});
		});
	}

	/**
	 * Validates that the SDK is properly initialized
	 */
	private validateSDKState(): void {
		if (!this.swapper) {
			throw new Error('Swapper not initialized - SDK state invalid');
		}
		if (!this.swapperFactory) {
			throw new Error('SwapperFactory not initialized - SDK state invalid');
		}
	}

	/**
	 * Ensures SDK is fully initialized with tokens available
	 */
	private async ensureSDKInitialized(): Promise<void> {
		// Check if tokens are already available
		if (
			this.swapperFactory?.Tokens?.STARKNET?.WBTC &&
			this.swapperFactory?.Tokens?.BITCOIN?.BTCLN
		) {
			logger.info('SDK tokens already available, skipping re-initialization');
			return;
		}

		logger.info('SDK tokens not available, forcing initialization...');

		try {
			// Create SDK initializer and force initialization
			const sdkInitializer = new SDKInitializerService(this.config);
			const result = await sdkInitializer.initializeSDK();

			// Update our instances with the newly initialized SDK
			this.swapperFactory = result.swapperFactory;
			this.swapper = result.swapper;

			logger.info('SDK forced initialization completed', {
				hasTokens: !!this.swapperFactory.Tokens,
				hasBitcoinTokens: !!this.swapperFactory.Tokens?.BITCOIN,
				hasStarknetTokens: !!this.swapperFactory.Tokens?.STARKNET,
				hasBTCLN: !!this.swapperFactory.Tokens?.BITCOIN?.BTCLN,
				hasWBTC: !!this.swapperFactory.Tokens?.STARKNET?.WBTC
			});

			// Final validation
			if (!this.swapperFactory.Tokens?.BITCOIN?.BTCLN) {
				throw new Error('BTCLN token still not available after forced initialization');
			}
			if (!this.swapperFactory.Tokens?.STARKNET?.WBTC) {
				throw new Error('WBTC token still not available after forced initialization');
			}
		} catch (error) {
			logger.error('Failed to force SDK initialization', error as Error);
			throw new Error(
				`SDK initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`
			);
		}
	}

	/**
	 * Gets source and destination tokens for the swap
	 */
	private async getTokensForSwap(sourceAsset: string): Promise<{
		sourceToken: any;
		destToken: any;
	}> {
		try {
			logger.info('Getting Starknet source token', {
				sourceAsset,
				tokenKey: TOKEN_MAP[sourceAsset as keyof typeof TOKEN_MAP]
			});

			// Debug: Log the entire Tokens structure
			logger.info('Full Tokens structure from SwapperFactory', {
				hasTokens: !!this.swapperFactory.Tokens,
				tokensKeys: this.swapperFactory.Tokens
					? Object.keys(this.swapperFactory.Tokens)
					: 'no tokens',
				hasStarknet: !!this.swapperFactory.Tokens?.STARKNET,
				starknetKeys: this.swapperFactory.Tokens?.STARKNET
					? Object.keys(this.swapperFactory.Tokens.STARKNET)
					: 'no starknet',
				hasBitcoin: !!this.swapperFactory.Tokens?.BITCOIN,
				bitcoinKeys: this.swapperFactory.Tokens?.BITCOIN
					? Object.keys(this.swapperFactory.Tokens.BITCOIN)
					: 'no bitcoin',
				fullTokensStructure: JSON.stringify(this.swapperFactory.Tokens, null, 2)
			});

			const tokenKey = TOKEN_MAP[sourceAsset as keyof typeof TOKEN_MAP];
			const sourceToken = this.swapperFactory.Tokens?.STARKNET?.[tokenKey];

			if (!sourceToken) {
				const availableTokens = Object.keys(this.swapperFactory.Tokens?.STARKNET || {});
				throw new Error(
					`Source token not available. Asset: ${sourceAsset}, TokenKey: ${tokenKey}, Available: ${availableTokens.join(', ')}`
				);
			}
			logger.info('Starknet source token retrieved successfully');

			logger.info('Getting Bitcoin Lightning destination token');
			const destToken = this.swapperFactory.Tokens?.BITCOIN?.BTCLN;
			if (!destToken) {
				throw new Error('Bitcoin Lightning token (BTCLN) not available');
			}
			logger.info('Bitcoin Lightning destination token retrieved successfully');

			return { sourceToken, destToken };
		} catch (tokenError) {
			logger.error(
				'Failed to access tokens from SwapperFactory for reverse swap',
				tokenError as Error,
				{
					sourceAsset,
					hasTokens: !!this.swapperFactory.Tokens,
					hasBitcoin: !!this.swapperFactory.Tokens?.BITCOIN,
					hasStarknet: !!this.swapperFactory.Tokens?.STARKNET
				}
			);
			throw tokenError;
		}
	}

	/**
	 * Gets the Starknet address where assets should be sent for ToBTC swaps
	 */
	private async getSwapAddress(swap: any): Promise<string> {
		try {
			// Log available methods for debugging
			const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(swap)).filter(
				(name) => typeof swap[name] === 'function'
			);
			logger.info('Available swap methods', {
				availableMethods,
				hasGetAddress: typeof swap.getAddress === 'function',
				hasData: !!swap.data,
				swapType: swap.getType?.()
			});

			// Log the entire swap object structure for debugging
			logger.info('Swap object structure for debugging', {
				swapKeys: Object.keys(swap),
				swapDataKeys: swap.data ? Object.keys(swap.data) : 'no data',
				swapType: typeof swap,
				swapConstructor: swap.constructor?.name,
				swapId: swap.getId?.(),
				swapState: swap.getState?.(),
				swapTypeMethod: swap.getType?.()
			});

			// For ToBTC swaps (Starknet→Lightning), we need to get the deposit address
			// where the user should send their Starknet tokens

			// First, try the standard getAddress method (works for most swap types)
			if (typeof swap.getAddress === 'function') {
				try {
					const address = swap.getAddress();
					logger.info('Retrieved address from getAddress method', {
						address,
						addressType: typeof address
					});

					if (address && typeof address === 'string') {
						return address;
					} else {
						logger.warn('getAddress() returned invalid value', {
							address,
							addressType: typeof address
						});
					}
				} catch (getAddressError) {
					logger.warn('getAddress() method failed', { error: getAddressError });
				}
			}

			// For ToBTC swaps, the address might be in the swap data
			if (swap.data && typeof swap.data.getOfferer === 'function') {
				try {
					const offererAddress = swap.data.getOfferer();
					logger.info('Retrieved offerer address from swap data', {
						offererAddress,
						addressType: typeof offererAddress
					});

					if (offererAddress && typeof offererAddress === 'string') {
						return offererAddress;
					} else {
						logger.warn('getOfferer() returned invalid value', {
							offererAddress,
							addressType: typeof offererAddress
						});
					}
				} catch (getOffererError) {
					logger.warn('getOfferer() method failed', { error: getOffererError });
				}
			}

			// Check if there's a deposit address property directly on the swap
			if (swap.depositAddress && typeof swap.depositAddress === 'string') {
				logger.info('Retrieved deposit address from swap.depositAddress', {
					depositAddress: swap.depositAddress
				});
				return swap.depositAddress;
			}

			// Check if there's an address property directly on the swap
			if (swap.address && typeof swap.address === 'string') {
				logger.info('Retrieved address from swap.address', {
					address: swap.address
				});
				return swap.address;
			}

			// Check for other common address properties
			const addressProperties = [
				'depositAddress',
				'address',
				'offererAddress',
				'sourceAddress',
				'fromAddress'
			];
			for (const prop of addressProperties) {
				if (swap[prop] && typeof swap[prop] === 'string') {
					logger.info(`Retrieved address from swap.${prop}`, {
						[prop]: swap[prop]
					});
					return swap[prop];
				}
			}

			// Check if there's a method to get the deposit address specifically for ToBTC swaps
			if (typeof swap.getDepositAddress === 'function') {
				try {
					const depositAddress = swap.getDepositAddress();
					logger.info('Retrieved deposit address from getDepositAddress method', {
						depositAddress,
						addressType: typeof depositAddress
					});

					if (depositAddress && typeof depositAddress === 'string') {
						return depositAddress;
					}
				} catch (getDepositAddressError) {
					logger.warn('getDepositAddress() method failed', {
						error: getDepositAddressError
					});
				}
			}

			// Check if there's a method to get the source address
			if (typeof swap.getSourceAddress === 'function') {
				try {
					const sourceAddress = swap.getSourceAddress();
					logger.info('Retrieved source address from getSourceAddress method', {
						sourceAddress,
						addressType: typeof sourceAddress
					});

					if (sourceAddress && typeof sourceAddress === 'string') {
						return sourceAddress;
					}
				} catch (getSourceAddressError) {
					logger.warn('getSourceAddress() method failed', {
						error: getSourceAddressError
					});
				}
			}

			// If we can't find the address, this is an error
			throw new Error(
				'Cannot determine Starknet deposit address - no valid address found in swap object'
			);
		} catch (error) {
			logger.error('Failed to get Starknet deposit address', error as Error, {
				swapId: swap.getId?.(),
				swapState: swap.getState?.(),
				swapType: swap.getType?.(),
				hasData: !!swap.data,
				errorMessage: error instanceof Error ? error.message : 'unknown error'
			});
			throw new Error('Failed to get Starknet deposit address for swap');
		}
	}

	/**
	 * Calculates estimated output based on Lightning invoice
	 */
	private async calculateEstimatedOutputFromInvoice(lightningAddress: string): Promise<number> {
		try {
			// In a real implementation, you would:
			// 1. Parse the Lightning invoice if it's a BOLT11 invoice
			// 2. Extract the amount from the invoice
			// 3. Apply any conversion rates and fees

			// For now, return a placeholder calculation
			// This should be replaced with actual invoice parsing
			if (lightningAddress.toLowerCase().startsWith('lnbc')) {
				// This is a BOLT11 invoice - parse it to get amount
				// Placeholder: assume 100,000 sats
				return 100000;
			} else if (lightningAddress.includes('@')) {
				// This is a Lightning address - amount needs to be specified elsewhere
				// For now, return a default
				return 50000;
			}

			// Default fallback
			return 25000;
		} catch (error) {
			logger.warn('Failed to calculate output from Lightning address', error as Error);
			return 25000; // Safe default
		}
	}

	/**
	 * Maps SDK swap state to human-readable status
	 */
	private mapSwapState(swapState: number): StarknetToLightningSwapResponse['status'] {
		const stateKey = swapState.toString() as keyof typeof SWAP_STATE_MAP;
		return (SWAP_STATE_MAP as any)[stateKey] || 'pending';
	}

	/**
	 * Calculates fees for the swap based on estimated output
	 */
	private calculateFees(estimatedOutput: number) {
		// Calculate fees based on the estimated BTC output
		const fixedFee = 2000; // 2000 sats fixed fee
		const percentageFee = Math.floor(estimatedOutput * 0.008); // 0.8% fee
		const totalFee = fixedFee + percentageFee;

		return {
			fixed: fixedFee,
			percentage: percentageFee,
			total: totalFee
		};
	}

	/**
	 * Validates a Starknet to Lightning swap request
	 */
	validateStarknetToLightningSwapRequest(request: StarknetToLightningSwapRequest): void {
		if (!request.sourceAsset || !['WBTC'].includes(request.sourceAsset)) {
			throw new Error('Unsupported source asset for Starknet to Lightning swap');
		}

		if (!request.starknetAddress || !request.starknetAddress.startsWith('0x')) {
			throw new Error('Invalid Starknet address format');
		}

		if (!request.lightningAddress) {
			throw new Error('Lightning address or invoice is required');
		}

		// Validate Lightning address format
		if (!this.isValidLightningAddress(request.lightningAddress)) {
			throw new Error('Invalid Lightning address or invoice format');
		}

		if (
			request.expirationMinutes &&
			(request.expirationMinutes < 5 || request.expirationMinutes > 1440)
		) {
			throw new Error('Expiration must be between 5 minutes and 24 hours');
		}
	}

	/**
	 * Validates Lightning address format
	 */
	private isValidLightningAddress(address: string): boolean {
		// BOLT11 invoice format
		if (address.toLowerCase().startsWith('lnbc') || address.toLowerCase().startsWith('lntb')) {
			return address.length > 20; // Basic length check
		}

		// Lightning address format (user@domain.com)
		if (address.includes('@')) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			return emailRegex.test(address);
		}

		// LNURL format
		if (address.toLowerCase().startsWith('lnurl')) {
			return address.length > 10;
		}

		return false;
	}
}
