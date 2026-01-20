/**
 * @fileoverview Centralized Lightning Network Types
 *
 * This module contains all Lightning Network related type definitions
 * to eliminate duplication across the codebase and ensure consistency.
 *
 * @author bim
 * @version 1.0.0
 */

/**
 * Lightning invoice structure for Bitcoin to Starknet swaps
 * Common interface supporting both client and server usage
 */
export interface LightningInvoice {
	swapId: string;
	invoice: string;
	hyperlink: string;
	expiresAt: string | Date;
	estimatedOutput?: number;
	amount?: number;
	starknetAddress?: string;
	destinationAsset?: string;
	qrCode?: string;
	fees?: {
		network: number;
		swap: number;
		total: number;
	};
}

/**
 * Parameters for creating a Lightning invoice
 */
export interface CreateLightningPaymentOptions {
	amount: number;
	starknetAddress: string;
	destinationAsset?: string;
	expirationMinutes?: number;
}

/**
 * Alternative interface name for invoice creation (backward compatibility)
 */
export interface InvoiceCreationParams extends CreateLightningPaymentOptions {}

/**
 * Swap status tracking for Lightning swaps
 */
export interface SwapStatus {
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
	timestamp?: string;
	updatedAt?: Date;
}

/**
 * Starknet to Lightning swap structure
 */
export interface StarknetToLightningSwap {
	swapId: string;
	lightningInvoice: string;
	amount: number;
	destinationAddress: string;
	status: SwapStatus['status'];
	createdAt: string;
	expiresAt: string;
}

/**
 * Parameters for creating Starknet to Lightning swaps
 */
export interface CreateStarknetToLightningSwapOptions {
	amount: number;
	lightningInvoice: string;
	sourceAsset?: string;
}

/**
 * Lightning quote information
 */
export interface LightningQuote {
	amount: number;
	estimatedOutput: number;
	fees: {
		network: number;
		swap: number;
		total: number;
	};
	rate: number;
	validUntil: string;
}

/**
 * Lightning service limits
 */
export interface LightningLimits {
	min: number;
	max: number;
	dailyLimit: number;
	currentDailyUsage: number;
}

/**
 * Lightning service health status
 */
export interface LightningHealthStatus {
	status: 'healthy' | 'unhealthy';
	services: Record<string, boolean>;
	dependencies: Record<string, boolean>;
	timestamp: string;
}

/**
 * Lightning payment validation result
 */
export interface PaymentValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Lightning swap transaction details
 */
export interface SwapTransactionDetails {
	swapId: string;
	transactionHash?: string;
	blockNumber?: number;
	confirmations: number;
	requiredConfirmations: number;
	estimatedCompletionTime?: string;
}

/**
 * Lightning service configuration
 */
export interface LightningServiceConfig {
	apiUrl: string;
	timeout: number;
	retryAttempts: number;
	retryDelay: number;
	healthCheckInterval: number;
}

/**
 * Lightning swap event for tracking
 */
export interface LightningSwapEvent {
	swapId: string;
	eventType: 'created' | 'paid' | 'confirmed' | 'completed' | 'failed' | 'expired';
	timestamp: string;
	data?: Record<string, any>;
}
