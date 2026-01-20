/**
 * @fileoverview Bitcoin Swaps Service for Atomiq
 *
 * This service handles Bitcoin on-chain to Starknet swaps using the Atomiq SDK,
 * including swap creation, validation, and address generation.
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import { handleBitcoinSwapError } from './error-handlers';
import type { AtomiqConfig, BitcoinSwapRequest, BitcoinSwapResponse } from './types';
import { SWAP_STATE_MAP, TOKEN_MAP } from './types';

/**
 * Service for Bitcoin on-chain to Starknet swaps
 */
export class BitcoinSwapsService {
	constructor(
		private config: AtomiqConfig,
		private swapperFactory: any,
		private swapper: any
	) {
		logger.info('BitcoinSwapsService initialized');
	}

	/**
	 * Creates a Bitcoin on-chain to Starknet swap
	 */
	async createBitcoinSwap(request: BitcoinSwapRequest): Promise<BitcoinSwapResponse> {
		try {
			logger.info('Creating Bitcoin on-chain swap with real Atomiq SDK', {
				amountSats: request.amountSats,
				destinationAsset: request.destinationAsset,
				starknetAddress: request.starknetAddress.substring(0, 10) + '...',
				hasSwapper: !!this.swapper,
				hasSwapperFactory: !!this.swapperFactory
			});

			// Validate SDK state before proceeding
			this.validateSDKState();

			// Get source and destination tokens
			const { sourceToken, destToken } = await this.getTokensForSwap(request.destinationAsset);

			logger.info('About to create Bitcoin swap with SDK', {
				amountSats: request.amountSats,
				starknetAddress: request.starknetAddress,
				destinationAsset: request.destinationAsset,
				amountBigInt: BigInt(request.amountSats).toString(),
				hasSourceToken: !!sourceToken,
				hasDestToken: !!destToken
			});

			// Create swap with real SDK following official documentation pattern for Bitcoin
			const swap = await this.swapper.swap(
				sourceToken, // Source token (BTC on-chain)
				destToken, // Destination token (Starknet asset)
				BigInt(request.amountSats), // Amount in satoshis
				true, // exactIn mode
				undefined, // Source address (not needed for BTC)
				request.starknetAddress // Destination address
			);

			if (!swap) {
				throw new Error('SDK returned null/undefined swap object');
			}

			logger.info('SDK Bitcoin swap created successfully', {
				swapId: swap.getId(),
				swapState: swap.getState(),
				hasGetAddress: typeof swap.getAddress === 'function',
				hasGetBip21Uri: typeof swap.getBip21Uri === 'function'
			});

			// Get Bitcoin address and payment details
			const bitcoinAddress = await swap.getAddress();
			const bip21Uri = await this.getBip21Uri(swap, request.amountSats);
			const swapId = swap.getId();
			const swapState = swap.getState();

			if (!bitcoinAddress) {
				throw new Error('Failed to generate Bitcoin address from SDK');
			}

			logger.info('Bitcoin address generated successfully', {
				swapId,
				addressLength: bitcoinAddress.length,
				hasBip21Uri: !!bip21Uri,
				swapState
			});

			// Calculate estimated output
			const estimatedOutput = this.calculateEstimatedOutput(
				request.amountSats,
				request.destinationAsset
			);

			// Calculate fees
			const fees = this.calculateFees(request.amountSats);

			// Create response
			const response: BitcoinSwapResponse = {
				swapId,
				bitcoinAddress,
				amount: request.amountSats,
				bip21Uri:
					bip21Uri || `bitcoin:${bitcoinAddress}?amount=${request.amountSats / 100_000_000}`,
				expiresAt: new Date(Date.now() + (request.expirationMinutes || 60) * 60 * 1000),
				estimatedOutput,
				fees,
				status: this.mapSwapState(swapState)
			};

			logger.info('Bitcoin swap created successfully', {
				swapId,
				addressGenerated: !!bitcoinAddress,
				estimatedOutput,
				status: response.status
			});

			return response;
		} catch (error) {
			handleBitcoinSwapError(error, request);
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
	 * Gets source and destination tokens for the swap
	 */
	private async getTokensForSwap(destinationAsset: string): Promise<{
		sourceToken: any;
		destToken: any;
	}> {
		try {
			logger.info('Getting Bitcoin on-chain token');
			const sourceToken = this.swapperFactory.Tokens?.BITCOIN?.BTC;
			if (!sourceToken) {
				throw new Error('Bitcoin on-chain token (BTC) not available');
			}
			logger.info('Bitcoin on-chain token retrieved successfully');

			logger.info('Getting Starknet destination token', {
				destinationAsset,
				tokenKey: (TOKEN_MAP as any)[destinationAsset]
			});

			const destToken =
				this.swapperFactory.Tokens?.STARKNET?.[(TOKEN_MAP as any)[destinationAsset]];

			if (!destToken) {
				const availableTokens = Object.keys(this.swapperFactory.Tokens?.STARKNET || {});
				throw new Error(
					`Destination token not available. Asset: ${destinationAsset}, TokenKey: ${(TOKEN_MAP as any)[destinationAsset]}, Available: ${availableTokens.join(', ')}`
				);
			}
			logger.info('Starknet destination token retrieved successfully');

			return { sourceToken, destToken };
		} catch (tokenError) {
			logger.error('Failed to access tokens from SwapperFactory', tokenError as Error, {
				destinationAsset,
				tokenKey: (TOKEN_MAP as any)[destinationAsset],
				hasTokens: !!this.swapperFactory.Tokens,
				hasBitcoin: !!this.swapperFactory.Tokens?.BITCOIN,
				hasStarknet: !!this.swapperFactory.Tokens?.STARKNET
			});
			throw tokenError;
		}
	}

	/**
	 * Gets BIP-21 URI for Bitcoin payment
	 */
	private async getBip21Uri(swap: any, amountSats: number): Promise<string | null> {
		try {
			if (typeof swap.getBip21Uri === 'function') {
				return await swap.getBip21Uri();
			}

			// Fallback: create BIP-21 URI manually
			const address = await swap.getAddress();
			if (address) {
				const amountBTC = (amountSats / 100_000_000).toFixed(8);
				return `bitcoin:${address}?amount=${amountBTC}`;
			}

			return null;
		} catch (error) {
			logger.warn('Failed to get BIP-21 URI from SDK', error as Error);
			return null;
		}
	}

	/**
	 * Maps SDK swap state to human-readable status
	 */
	private mapSwapState(swapState: number): BitcoinSwapResponse['status'] {
		const stateKey = swapState.toString() as keyof typeof SWAP_STATE_MAP;
		return (SWAP_STATE_MAP as any)[stateKey] || 'pending';
	}

	/**
	 * Calculates estimated output for the swap
	 */
	private calculateEstimatedOutput(amountSats: number, destinationAsset: string): number {
		// This is a simplified calculation - in reality, you'd use:
		// - Current BTC price
		// - Destination asset price
		// - Liquidity and slippage
		// - Network fees

		const baseRate = 50000; // $50k BTC price assumption
		const satoshisToBTC = amountSats / 100_000_000;
		const usdValue = satoshisToBTC * baseRate;

		switch (destinationAsset) {
			case 'WBTC':
				return Math.floor(amountSats * 0.995); // 0.5% fee (higher than Lightning due to on-chain costs)
			default:
				return amountSats;
		}
	}

	/**
	 * Calculates fees for the swap
	 */
	private calculateFees(amountSats: number) {
		const fixedFee = 5000; // 5000 sats fixed fee (higher than Lightning for on-chain)
		const percentageFee = Math.floor(amountSats * 0.01); // 1% fee
		const totalFee = fixedFee + percentageFee;

		return {
			fixed: fixedFee,
			percentage: percentageFee,
			total: totalFee
		};
	}

	/**
	 * Validates a Bitcoin swap request
	 */
	validateBitcoinSwapRequest(request: BitcoinSwapRequest): void {
		if (!request.amountSats || request.amountSats <= 0) {
			throw new Error('Invalid amount: must be positive');
		}

		if (request.amountSats < 10000) {
			throw new Error('Amount too small: minimum 10,000 satoshis for Bitcoin swaps');
		}

		if (request.amountSats > 1_000_000_000) {
			throw new Error('Amount too large: maximum 10 BTC');
		}

		if (!request.starknetAddress || !request.starknetAddress.startsWith('0x')) {
			throw new Error('Invalid Starknet address format');
		}

		if (!request.destinationAsset || !['WBTC'].includes(request.destinationAsset)) {
			throw new Error('Unsupported destination asset');
		}

		if (
			request.expirationMinutes &&
			(request.expirationMinutes < 30 || request.expirationMinutes > 2880)
		) {
			throw new Error('Expiration must be between 30 minutes and 48 hours for Bitcoin swaps');
		}
	}
}
