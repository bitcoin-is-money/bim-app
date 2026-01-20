/**
 * @fileoverview Starknet to Bitcoin On-Chain Swaps Service for Atomiq
 *
 * Creates swaps from Starknet assets (e.g. WBTC) to Bitcoin on-chain addresses
 * using the Atomiq SDK. Intended to be used when a BIP-21 Bitcoin URI/address
 * is scanned or input by the user.
 */

import { logger } from '$lib/utils/logger';
import { validateStarknetAddress } from '$lib/middleware/validation/starknet';
import {
	type StarknetToBitcoinSwapRequest,
	type StarknetToBitcoinSwapResponse,
	TOKEN_MAP,
	mapSwapStateByDirection
} from './types';

export class StarknetToBitcoinService {
	constructor(
		private config: any,
		private swapperFactory: any,
		private swapper: any
	) {
		logger.info('StarknetToBitcoinService initialized');
	}

	async createStarknetToBitcoinSwap(
		request: StarknetToBitcoinSwapRequest
	): Promise<StarknetToBitcoinSwapResponse & { swapObject?: any }> {
		try {
			logger.info('Creating Starknet→Bitcoin (on-chain) swap with SDK', {
				sourceAsset: request.sourceAsset,
				starknetAddress: request.starknetAddress?.substring(0, 10) + '...',
				bitcoinAddress: request.bitcoinAddress?.substring(0, 8) + '...',
				amountSats: request.amountSats
			});

			this.validateSDKState();

			// Ensure required tokens exist
			const { sourceToken, destToken } = await this.getTokensForSwap(request.sourceAsset);

			// For on-chain BTC, amount is optional. If present, we treat it as desired BTC out.
			// The SDK signature: swap(sourceToken, destToken, amount, exactIn, from, to)
			// - When swapping TO Bitcoin, we pass exactIn=false, amount=desired BTC sats (if provided)
			const amountArg =
				typeof request.amountSats === 'number' && request.amountSats > 0
					? BigInt(request.amountSats)
					: undefined;

			const swap = await this.swapper.swap(
				sourceToken,
				destToken,
				amountArg,
				false, // exactIn=false for ToBTC; SDK computes required input
				request.starknetAddress,
				request.bitcoinAddress
			);

			if (!swap) throw new Error('SDK returned empty swap object');

			const swapId = swap.getId();
			const swapState = swap.getState?.() ?? 0;

			// Determine Starknet deposit address (where user will send their tokens)
			const starknetDepositAddress = await this.getSwapAddress(swap, request.starknetAddress);

			// Estimate output (if amount provided, use it; otherwise placeholder 0)
			const estimatedOutput =
				typeof request.amountSats === 'number' && request.amountSats > 0 ? request.amountSats : 0;

			const fees = this.calculateFees(estimatedOutput);

			// Ensure minimum expiration time to prevent premature expiration
			const minExpirationMinutes = 10; // Minimum 10 minutes
			const requestedExpiration = request.expirationMinutes || 60;
			const safeExpirationMinutes = Math.max(requestedExpiration, minExpirationMinutes);

			if (requestedExpiration < minExpirationMinutes) {
				logger.warn('Bitcoin swap expiration time increased to minimum safe value', {
					swapId,
					requestedMinutes: requestedExpiration,
					adjustedMinutes: safeExpirationMinutes,
					reason: 'Prevent premature expiration due to network delays'
				});
			}

			const response: StarknetToBitcoinSwapResponse = {
				swapId,
				starknetAddress: starknetDepositAddress,
				estimatedOutput,
				fees,
				status: mapSwapStateByDirection(swapState, 'starknet_to_bitcoin'),
				expiresAt: new Date(Date.now() + safeExpirationMinutes * 60 * 1000)
			};

			logger.info('Starknet→Bitcoin swap created', {
				swapId,
				status: response.status,
				depositAddress: starknetDepositAddress
			});

			return { ...response, swapObject: swap };
		} catch (error) {
			logger.error('Failed to create Starknet→Bitcoin swap', error as Error, {
				request
			});
			throw error instanceof Error ? error : new Error('Failed to create Starknet→Bitcoin swap');
		}
	}

	private validateSDKState(): void {
		if (!this.swapper) throw new Error('Swapper not initialized');
		if (!this.swapperFactory) throw new Error('SwapperFactory not initialized');
	}

	private async getTokensForSwap(sourceAsset: string): Promise<{
		sourceToken: any;
		destToken: any;
	}> {
		const tokenKey = TOKEN_MAP[sourceAsset as keyof typeof TOKEN_MAP];

		// Starknet source token (e.g., WBTC)
		const sourceToken = this.swapperFactory?.Tokens?.STARKNET?.[tokenKey];
		if (!sourceToken) {
			const available = Object.keys(this.swapperFactory?.Tokens?.STARKNET || {});
			throw new Error(`Source token not available: ${sourceAsset} (have: ${available.join(', ')})`);
		}

		// Bitcoin destination token (BTC on-chain)
		const destToken = this.swapperFactory?.Tokens?.BITCOIN?.BTC;
		if (!destToken) throw new Error('Bitcoin BTC token not available');

		return { sourceToken, destToken };
	}

	private async getSwapAddress(swap: any, excludeAddress?: string): Promise<string> {
		const EXCLUDED_HEX = new Set([
			'0x534e5f4d41494e', // SN_MAIN
			'0x534e5f5345504f4c4941', // SN_SEPOLIA
			'0x414e595f43414c4c4552' // ANY_CALLER
		]);
		const isLikelyStarknetAddress = (addr: unknown) => {
			if (typeof addr !== 'string' || !addr.startsWith('0x')) return false;
			if (EXCLUDED_HEX.has(addr)) return false;
			const hex = addr.slice(2);
			if (!/^[0-9a-fA-F]+$/.test(hex)) return false;
			// Heuristic: require a minimum length to filter out chain IDs and small constants
			if (hex.length < 40) return false; // ~20 bytes minimum
			return validateStarknetAddress(addr);
		};

		try {
			// Collect candidates from methods (prefer those likely to be Starknet deposit addresses)
			const candidates: Array<{ source: string; value: string | undefined }> = [];

			try {
				if (swap?.data && typeof swap.data.getOfferer === 'function') {
					const v = swap.data.getOfferer();
					candidates.push({ source: 'data.getOfferer()', value: v });
				}
			} catch {}

			// getSourceAddress() often returns the user's own address; de-prioritize
			try {
				if (typeof swap.getSourceAddress === 'function') {
					const v = swap.getSourceAddress();
					candidates.push({ source: 'getSourceAddress()', value: v });
				}
			} catch {}

			try {
				if (typeof swap.getDepositAddress === 'function') {
					const v = swap.getDepositAddress();
					candidates.push({ source: 'getDepositAddress()', value: v });
				}
			} catch {}

			try {
				if (typeof swap.getAddress === 'function') {
					const v = swap.getAddress();
					candidates.push({ source: 'getAddress()', value: v });
				}
			} catch {}

			// Then from properties
			const propList = [
				'depositAddress',
				'address',
				'offererAddress',
				'sourceAddress',
				'fromAddress'
			];
			for (const p of propList) {
				if (typeof swap?.[p] === 'string') {
					candidates.push({ source: `prop:${p}`, value: swap[p] as string });
				}
			}

			// Log candidates
			logger.info('Starknet→Bitcoin swap address candidates', {
				count: candidates.length,
				previews: candidates.map((c) => ({
					source: c.source,
					value: typeof c.value === 'string' ? `${c.value.slice(0, 10)}...` : String(c.value),
					isHex: typeof c.value === 'string' && c.value.startsWith('0x')
				}))
			});

			const loweredExclude = excludeAddress?.toLowerCase();
			// Pick first valid Starknet hex address that is not the user's own address
			const chosen = candidates.find(
				(c) => isLikelyStarknetAddress(c.value) && c.value!.toLowerCase() !== loweredExclude
			);
			if (chosen?.value) {
				logger.info('Chose Starknet deposit address for SN→BTC', {
					source: chosen.source,
					addressPreview: `${chosen.value.slice(0, 12)}...`
				});
				return chosen.value;
			}

			// As a last resort, scan all enumerable string properties for 0x... (and not excluded)
			try {
				const seen = new Set<string>();
				const found: Array<{ key: string; value: string }> = [];
				const visit = (obj: any, prefix: string, depth: number) => {
					if (!obj || depth > 3) return;
					if (typeof obj === 'string') {
						if (isLikelyStarknetAddress(obj)) {
							const low = obj.toLowerCase();
							if (low !== loweredExclude && !seen.has(low)) {
								seen.add(low);
								found.push({ key: prefix, value: obj });
							}
						}
						return;
					}
					if (Array.isArray(obj)) {
						obj.forEach((v, idx) => visit(v, `${prefix}[${idx}]`, depth + 1));
						return;
					}
					if (typeof obj === 'object') {
						for (const [k, v] of Object.entries(obj)) {
							visit(v, `${prefix}.${k}`, depth + 1);
						}
					}
				};
				visit(swap, 'swap', 0);

				if (found.length > 0) {
					logger.info('Deep-scan found candidate Starknet addresses', {
						count: found.length,
						previews: found.slice(0, 5).map((f) => ({
							key: f.key,
							value: `${f.value.slice(0, 12)}...`
						}))
					});
					return found[0].value;
				}
			} catch {}

			throw new Error('Failed to determine Starknet deposit address (no 0x address found)');
		} catch (error) {
			logger.error('Failed to get Starknet deposit address', error as Error);
			throw new Error('Failed to get Starknet deposit address for swap');
		}
	}

	private calculateFees(estimatedOutSats: number) {
		// Simple placeholder fee model; SDK/limits service provides real caps
		const fixed = 200; // sats
		const percentage = Math.floor(estimatedOutSats * 0.005); // 0.5%
		const total = fixed + percentage;
		return { fixed, percentage, total };
	}
}
