/**
 * @fileoverview Atomiq Service Types and Interfaces
 *
 * This file contains all TypeScript interfaces, types, and constants
 * used by the Atomiq cross-chain swap services.
 *
 * @author bim
 * @version 1.0.0
 */

/**
 * Atomiq SDK configuration
 */
export interface AtomiqConfig {
	bitcoinNetwork: 'mainnet' | 'testnet';
	starknetRpcUrl: string | undefined;
	webhookUrl?: string;
	timeout?: number;
	retries?: number;
	intermediaryUrls?: string[];
}

/**
 * Supported assets for swaps (based on what's available in Atomiq SDK)
 */
export type SupportedAsset = 'WBTC';

/**
 * Lightning swap request
 */
export interface LightningSwapRequest {
	amountSats: number;
	destinationAsset: SupportedAsset;
	starknetAddress: string;
	expirationMinutes?: number;
	webhookUrl?: string;
}

/**
 * Lightning swap response
 */
export interface LightningSwapResponse {
	swapId: string;
	invoice: string;
	hyperlink: string; // QR code data from SDK getHyperlink() method
	expiresAt: Date;
	estimatedOutput: number;
	fees: {
		fixed: number;
		percentage: number;
		total: number;
	};
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
}

/**
 * Lightning swap response with SDK swap object for status tracking
 */
export interface LightningSwapResponseWithSwapObject extends LightningSwapResponse {
	swapObject: any; // The actual SDK swap object for status tracking
}

/**
 * Bitcoin on-chain swap request
 */
export interface BitcoinSwapRequest {
	amountSats: number;
	destinationAsset: SupportedAsset;
	starknetAddress: string;
	expirationMinutes?: number;
	webhookUrl?: string;
}

/**
 * Bitcoin on-chain swap response
 */
export interface BitcoinSwapResponse {
	swapId: string;
	bitcoinAddress: string; // Address for user to send Bitcoin to
	amount: number; // Exact amount in satoshis
	bip21Uri: string; // BIP-21 URI for QR code generation
	expiresAt: Date;
	estimatedOutput: number;
	fees: {
		fixed: number;
		percentage: number;
		total: number;
	};
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
}

/**
 * Starknet to Lightning swap request
 */
export interface StarknetToLightningSwapRequest {
	sourceAsset: SupportedAsset;
	starknetAddress: string; // Starknet address to send assets from
	lightningAddress: string; // Lightning address/invoice to receive BTC
	amountInSats: number; // Amount to send in satoshis (resolved from invoice or user input)
	expirationMinutes?: number;
	webhookUrl?: string;
}

/**
 * Starknet to Lightning swap response
 */
export interface StarknetToLightningSwapResponse {
	swapId: string;
	starknetAddress: string; // Address to send Starknet assets to
	estimatedOutput: number; // Estimated BTC output in satoshis (determined by Lightning invoice)
	fees: {
		fixed: number;
		percentage: number;
		total: number;
	};
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
	expiresAt: Date;
}

/**
 * Starknet to Bitcoin (on-chain) swap request
 */
export interface StarknetToBitcoinSwapRequest {
	sourceAsset: SupportedAsset;
	starknetAddress: string; // Starknet address to send assets from
	bitcoinAddress: string; // Bitcoin on-chain address (BIP-21 dest)
	amountSats?: number; // Optional desired BTC out amount (sats)
	expirationMinutes?: number;
	webhookUrl?: string;
}

/**
 * Starknet to Bitcoin (on-chain) swap response
 */
export interface StarknetToBitcoinSwapResponse {
	swapId: string;
	starknetAddress: string; // Address to send Starknet assets to (deposit address)
	estimatedOutput: number; // Estimated BTC output in satoshis
	fees: {
		fixed: number;
		percentage: number;
		total: number;
	};
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
	expiresAt: Date;
}

/**
 * Swap status update
 */
export interface SwapStatusUpdate {
	swapId: string;
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
	progress: number;
	amountReceived?: number;
	txHash?: string;
	errorMessage?: string;
	timestamp: Date;
}

/**
 * Asset limits from Atomiq SDK
 */
export interface AssetLimits {
	asset: SupportedAsset;
	minAmount: number;
	maxAmount: number;
	maxDailyVolume: number;
	fees: {
		fixed: number;
		percentage: number;
	};
}

/**
 * Legacy swap state mapping - replaced by direction-aware mapping
 * @deprecated Use mapSwapStateByDirection() instead
 */
export const SWAP_STATE_MAP = {
	'-3': 'failed', // Permanent failure
	'-2': 'failed', // Transaction failed
	'-1': 'pending', // Temporary error, may recover - changed from 'failed'
	'0': 'pending', // Initial state
	'1': 'waiting_payment', // Generic mapping - use direction-aware mapping instead
	'2': 'paid', // Payment received, processing
	'3': 'completed' // Successfully completed
} as const;

/**
 * Direction-aware swap state mapping based on Atomiq documentation
 *
 * Lightning-to-Starknet (FromBTCLNSwapState):
 * - PR_CREATED = 0: Invoice created, waiting for payment
 * - PR_PAID = 1: Payment received, ready to claim
 * - CLAIM_COMMITED = 2: Claiming initiated
 * - CLAIM_CLAIMED = 3: Successfully claimed
 *
 * Starknet-to-Lightning (ToBTCSwapState):
 * - CREATED = 0: Quote created, waiting to execute
 * - COMMITED = 1: Init transaction sent, waiting
 * - SOFT_CLAIMED = 2: Processed but not claimed on-chain
 * - CLAIMED = 3: Successfully claimed
 * - REFUNDABLE = 4: Can be refunded
 */
export function mapSwapStateByDirection(
	swapState: number,
	swapDirection: SwapDirection | undefined
): SwapStatusUpdate['status'] {
	// Handle negative states (failures/expired) with direction-specific logic
	if (swapState < 0) {
		if (swapDirection === 'starknet_to_bitcoin') {
			// Bitcoin swaps have different failure semantics
			switch (swapState) {
				case -4:
					return 'failed'; // Permanent failure
				case -3:
					return 'expired'; // REFUNDED - original quote expired
				case -2:
					return 'expired'; // QUOTE_EXPIRED - expired normally
				case -1:
					return 'pending'; // QUOTE_SOFT_EXPIRED - may recover, continue monitoring
				default:
					return 'failed';
			}
		} else {
			// Lightning and other swap directions
			switch (swapState) {
				case -4:
					return 'failed'; // FromBTCLN: FAILED
				case -3:
					return 'expired'; // FromBTCLN: QUOTE_EXPIRED
				case -2:
					return 'expired'; // FromBTCLN: QUOTE_SOFT_EXPIRED
				case -1:
					return 'expired'; // FromBTCLN: EXPIRED
				default:
					return 'failed';
			}
		}
	}

	// Handle positive states based on swap direction
	if (swapDirection === 'lightning_to_starknet') {
		// Lightning-to-Starknet (FromBTCLNSwapState) mapping
		let mappedStatus: SwapStatusUpdate['status'];
		switch (swapState) {
			case 0:
				mappedStatus = 'pending';
				break; // PR_CREATED - invoice created, waiting for payment
			case 1:
				mappedStatus = 'paid';
				break; // PR_PAID - payment received, ready to claim
			case 2:
				mappedStatus = 'confirming';
				break; // CLAIM_COMMITED - claiming initiated
			case 3:
				mappedStatus = 'completed';
				break; // CLAIM_CLAIMED - successfully claimed
			default:
				mappedStatus = 'pending';
				break;
		}
		console.log(`🗺️ Lightning-to-Starknet state mapping: ${swapState} → ${mappedStatus}`);
		return mappedStatus;
	} else if (swapDirection === 'starknet_to_lightning' || swapDirection === 'starknet_to_bitcoin') {
		// Starknet-to-Lightning and Starknet-to-Bitcoin share ToBTC state mapping
		switch (swapState) {
			case 0:
				return 'pending'; // CREATED - quote created, waiting to execute
			case 1:
				return 'waiting_payment'; // COMMITED - init transaction sent, waiting
			case 2:
				return 'confirming'; // SOFT_CLAIMED - processed but not claimed on-chain
			case 3:
				return 'completed'; // CLAIMED - successfully claimed
			case 4:
				return 'paid'; // REFUNDABLE - can be refunded (ready for refund action)
			default:
				return 'pending';
		}
	} else {
		// Fallback to legacy mapping for unknown directions
		const stateKey = swapState.toString() as keyof typeof SWAP_STATE_MAP;
		return (SWAP_STATE_MAP as any)[stateKey] || 'pending';
	}
}

/**
 * Token mapping for supported assets (based on Atomiq SDK availability)
 */
export const TOKEN_MAP = {
	WBTC: 'WBTC' // Wrapped Bitcoin - available in SDK
} as const;

/**
 * Swap status types for type safety
 */
export type SwapStatus =
	| 'pending'
	| 'waiting_payment'
	| 'paid'
	| 'confirming'
	| 'completed'
	| 'failed'
	| 'expired';

/**
 * Swap direction types
 */
export type SwapDirection =
	| 'lightning_to_starknet'
	| 'bitcoin_to_starknet'
	| 'starknet_to_lightning'
	| 'starknet_to_bitcoin';

/**
 * Common swap fees structure
 */
export interface SwapFees {
	fixed: number;
	percentage: number;
	total: number;
}
