/**
 * @fileoverview Lightning Swaps Service for Atomiq
 *
 * This service handles Lightning Network to Starknet swaps using the Atomiq SDK,
 * including swap creation, validation, and monitoring.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import { getSupportedAssets } from '../atomiq-assets';
import { handleLightningSwapError } from './error-handlers';
import { SDKInitializerService } from './initialization/sdk-initializer.service';
import type {
	LightningSwapRequest,
	LightningSwapResponse,
	LightningSwapResponseWithSwapObject
} from './types';
import { TOKEN_MAP, mapSwapStateByDirection } from './types';

/**
 * Service for Lightning Network to Starknet swaps
 */
export class LightningToStarknetService {
	constructor(
		private config: any,
		private swapperFactory: any,
		private swapper: any
	) {
		logger.info('LightningToStarknetService initialized');
	}

	/**
	 * Creates a Lightning Network to Starknet swap
	 */
	async createLightningToStarknetSwap(
		request: LightningSwapRequest
	): Promise<LightningSwapResponseWithSwapObject> {
		try {
			logger.info('Creating Lightning swap with real Atomiq SDK', {
				amountSats: request.amountSats,
				destinationAsset: request.destinationAsset,
				starknetAddress: request.starknetAddress.substring(0, 10) + '...',
				hasSwapper: !!this.swapper,
				hasSwapperFactory: !!this.swapperFactory
			});

			// Validate SDK state before proceeding
			this.validateSDKState();

			// Force SDK initialization if tokens are not available
			await this.ensureSDKInitialized();

			// // Get source and destination tokens
			// const { sourceToken, destToken } = await this.getTokensForSwap(
			//   request.destinationAsset
			// );

			logger.info('About to create swap with SDK', {
				amountSats: request.amountSats,
				starknetAddress: request.starknetAddress,
				destinationAsset: request.destinationAsset,
				amountBigInt: BigInt(request.amountSats).toString()
				/*         hasSourceToken: !!sourceToken,
                hasDestToken: !!destToken,
                sourceToken: sourceToken,
                destToken: destToken, */
			});

			const _exactIn = true; //exactIn = true, so we specify the input amount

			const Tokens = this.swapperFactory.Tokens; //Get the supported tokens for all the specified chains.

			// Create the swap using SDK
			const swap = await this.swapper.swap(
				Tokens.BITCOIN.BTCLN, //Swap from BTC-LN,
				Tokens.STARKNET.WBTC, //Into specified destination token,
				BigInt(request.amountSats),
				_exactIn,
				undefined, //Source address for the swap, not used for swaps from BTC-LN
				request.starknetAddress
			);

			if (!swap) {
				throw new Error('SDK returned null/undefined swap object');
			}

			logger.info('SDK swap created successfully', {
				swapId: swap.getId(),
				swapState: swap.getState(),
				hasGetAddress: typeof swap.getAddress === 'function',
				hasGetHyperlink: typeof swap.getHyperlink === 'function'
			});

			// Generate invoice and get swap details
			const invoice = await swap.getAddress();
			const hyperlink = await swap.getHyperlink();
			const swapId = swap.getId();
			const swapState = swap.getState();

			if (!invoice) {
				throw new Error('Failed to generate Lightning invoice address from SDK');
			}

			logger.info('Lightning invoice generated successfully', {
				swapId,
				invoiceLength: invoice.length,
				hasHyperlink: !!hyperlink,
				swapState
			});

			// Calculate estimated output (this would normally come from SDK)
			const estimatedOutput = this.calculateEstimatedOutput(
				request.amountSats,
				request.destinationAsset
			);

			// Calculate fees
			const fees = this.calculateFees(request.amountSats);

			// Create response
			const response: LightningSwapResponse = {
				swapId,
				invoice,
				hyperlink: hyperlink || invoice, // Fallback to invoice if hyperlink not available
				expiresAt: new Date(Date.now() + (request.expirationMinutes || 60) * 60 * 1000),
				estimatedOutput,
				fees,
				status: this.mapSwapState(swapState)
			};

			logger.info('Lightning swap created successfully', {
				swapId,
				invoiceGenerated: !!invoice,
				estimatedOutput,
				status: response.status
			});

			// Return both response and swap object for proper status tracking
			return {
				...response,
				swapObject: swap // Include the actual SDK swap object
			};
		} catch (error) {
			handleLightningSwapError(error, request);
		}
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
			this.swapperFactory?.Tokens?.BITCOIN?.BTCLN &&
			this.swapperFactory?.Tokens?.STARKNET?.WBTC
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
	private async getTokensForSwap(destinationAsset: string): Promise<{
		sourceToken: any;
		destToken: any;
	}> {
		try {
			logger.info('Getting Bitcoin Lightning token');
			const sourceToken = this.swapperFactory.Tokens?.BITCOIN?.BTCLN;
			if (!sourceToken) {
				throw new Error('Bitcoin Lightning token (BTCLN) not available');
			}
			logger.info('Bitcoin Lightning token retrieved successfully');

			logger.info('Getting Starknet destination token', {
				destinationAsset,
				tokenKey: TOKEN_MAP[destinationAsset]
			});

			const destToken = this.swapperFactory.Tokens?.STARKNET?.[TOKEN_MAP[destinationAsset]];

			if (!destToken) {
				const availableTokens = Object.keys(this.swapperFactory.Tokens?.STARKNET || {});
				throw new Error(
					`Destination token not available. Asset: ${destinationAsset}, TokenKey: ${TOKEN_MAP[destinationAsset]}, Available: ${availableTokens.join(', ')}`
				);
			}
			logger.info('Starknet destination token retrieved successfully');

			return { sourceToken, destToken };
		} catch (tokenError) {
			logger.error('Failed to access tokens from SwapperFactory', tokenError as Error, {
				destinationAsset,
				tokenKey: TOKEN_MAP[destinationAsset],
				hasTokens: !!this.swapperFactory.Tokens,
				hasBitcoin: !!this.swapperFactory.Tokens?.BITCOIN,
				hasStarknet: !!this.swapperFactory.Tokens?.STARKNET
			});
			throw tokenError;
		}
	}

	/**
	 * Maps SDK swap state to human-readable status using direction-aware mapping
	 */
	private mapSwapState(swapState: number): LightningSwapResponse['status'] {
		// Use direction-aware mapping for Lightning-to-Starknet swaps
		return mapSwapStateByDirection(swapState, 'lightning_to_starknet');
	}

	/**
	 * Calculates estimated output for the swap
	 * In a real implementation, this would come from the SDK or price feeds
	 */
	private calculateEstimatedOutput(amountSats: number, destinationAsset: string): number {
		// This is a simplified calculation - in reality, you'd use:
		// - Current BTC price
		// - Destination asset price
		// - Liquidity and slippage
		// - Network fees

		// For now, return a placeholder calculation
		const baseRate = 50000; // $50k BTC price assumption
		const satoshisToBTC = amountSats / 100_000_000;
		const usdValue = satoshisToBTC * baseRate;

		switch (destinationAsset) {
			case 'WBTC':
				return Math.floor(amountSats * 0.998); // 0.2% fee
			default:
				return amountSats;
		}
	}

	/**
	 * Calculates fees for the swap
	 */
	private calculateFees(amountSats: number) {
		const fixedFee = 1000; // 1000 sats fixed fee
		const percentageFee = Math.floor(amountSats * 0.005); // 0.5% fee
		const totalFee = fixedFee + percentageFee;

		return {
			fixed: fixedFee,
			percentage: percentageFee,
			total: totalFee
		};
	}

	/**
	 * Validates a Lightning swap request
	 */
	async validateLightningSwapRequest(request: LightningSwapRequest): Promise<void> {
		if (!request.amountSats || request.amountSats <= 0) {
			throw new Error('Invalid amount: must be positive');
		}

		if (request.amountSats < 1000) {
			throw new Error('Amount too small: minimum 1000 satoshis');
		}

		if (request.amountSats > 100_000_000) {
			throw new Error('Amount too large: maximum 1 BTC');
		}

		if (!request.starknetAddress || !request.starknetAddress.startsWith('0x')) {
			throw new Error('Invalid Starknet address format');
		}

		const supportedAssets = await getSupportedAssets();
		if (!request.destinationAsset || !supportedAssets.includes(request.destinationAsset)) {
			throw new Error('Unsupported destination asset');
		}

		if (
			request.expirationMinutes &&
			(request.expirationMinutes < 5 || request.expirationMinutes > 1440)
		) {
			throw new Error('Expiration must be between 5 minutes and 24 hours');
		}
	}
}
