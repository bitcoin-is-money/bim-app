/**
 * @fileoverview Lightning Service Type Definitions
 *
 * Shared type definitions for Lightning Network operations.
 */

/**
 * Lightning Invoice structure
 */
export interface LightningInvoice {
	swapId: string;
	invoice: string;
	hyperlink?: string; // QR code data from SDK getHyperlink() method
	amount: number;
	destinationAsset: string;
	starknetAddress: string;
	expiresAt: string;
	createdAt: string;
}

/**
 * Invoice creation parameters
 */
export interface InvoiceCreationParams {
	amount: number;
	starknetAddress: string;
	destinationAsset?: string;
}

/**
 * Swap status information
 */
export interface SwapStatus {
	swapId: string;
	status: string;
	progress: number;
	txHash?: string;
	errorMessage?: string;
	lastUpdated: string;
}

/**
 * Lightning quote information
 */
export interface LightningQuote {
	estimatedOutput: number;
	fees: {
		network: number;
		swap: number;
		total: number;
	};
	exchangeRate: number;
	amount?: number;
	rate?: number;
	expiresAt?: string;
}

/**
 * Quote request parameters
 */
export interface QuoteParams {
	amount: number;
	destinationAsset: string;
}

/**
 * Lightning limits information
 */
export interface LightningLimits {
	minAmount: number;
	maxAmount: number;
	maxDailyVolume: number;
	fees: {
		fixed: number;
		percentage: number;
	};
	min?: number;
	max?: number;
	dailyLimit?: number;
	remainingDaily?: number;
}

/**
 * Starknet to Lightning swap parameters
 */
export interface StarknetToLightningParams {
	lightningAddress: string;
	sourceAsset?: string;
	starknetAddress?: string;
	expirationMinutes?: number;
}

/**
 * Starknet to Lightning swap result
 */
export interface StarknetToLightningSwap {
	swapId: string;
	amount: number;
	lightningAddress: string;
	sourceAsset: string;
	status: string;
	createdAt: string;
}

/**
 * Starknet receive data structure for QR code generation
 */
export interface StarknetReceiveData {
	recipientAddress: string;
	amount: number; // in satoshis
	network: 'Starknet';
}
