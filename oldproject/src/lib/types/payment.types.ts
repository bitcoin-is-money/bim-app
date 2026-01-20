import type { Call } from 'starknet';
import type { SupportedCurrency } from '$lib/services/server/user-settings.service';

/**
 * Payment transaction input parameters
 */
export interface PaymentRequest {
	/** Recipient address */
	address: string;
	/** Amount in satoshis */
	amountInSats: number;
	/** Optional transaction description */
	description?: string;
	/** Whether to use paymaster for sponsored transactions */
	usePaymaster?: boolean;
}

/**
 * Payment transaction result
 */
export interface PaymentResult {
	/** Transaction hash */
	transactionHash: string;
	/** Whether the transaction was successful */
	success: boolean;
	/** Whether paymaster was used */
	usedPaymaster: boolean;
	/** Error message if transaction failed */
	error?: string;
}

/**
 * Payment validation result
 */
export interface PaymentValidation {
	/** Whether inputs are valid */
	isValid: boolean;
	/** Validation error messages */
	errors: string[];
}

/**
 * Gas estimation result
 */
// GasEstimation removed: manual gas execution is disabled in paymaster-only mode

/**
 * Payment transaction calls
 */
export interface PaymentCalls {
	/** Transfer call */
	transferCall: Call;
	/** Fee call */
	feeCall: Call;
	/** Combined calls array */
	calls: Call[];
}

/**
 * Payment configuration
 */
export interface PaymentConfig {
	/** WBTC token contract address */
	wbtcTokenAddress: string;
	/** Minimum transfer amount in sats */
	minimumAmount: number;
	/** Maximum gas limits */
	maxGasLimits: {
		l1Gas: number;
		l2Gas: number;
		l1DataGas: number;
	};
}

/**
 * Transaction state for UI updates
 */
export interface PaymentTransactionState {
	/** Whether transaction is being processed */
	isProcessing: boolean;
	/** Transaction error message */
	error: string;
	/** Whether transaction was successful */
	success: boolean;
	/** Transaction hash */
	hash: string;
}

/**
 * Currency conversion utilities
 */
export interface CurrencyConversion {
	/** Current currency (SATS or fiat) */
	currentCurrency: 'SATS' | SupportedCurrency;
	/** Amount in sats */
	amountInSats: number;
	/** Display amount (formatted) */
	displayAmount: string;
}

/**
 * Payment service events
 */
export interface PaymentServiceEvents {
	/** Transaction state changed */
	stateChange: PaymentTransactionState;
	/** Validation result */
	validationResult: PaymentValidation;
	/** Payment completed */
	paymentComplete: PaymentResult;
}
