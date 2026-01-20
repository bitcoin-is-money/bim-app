/**
 * @fileoverview Wallet Dashboard Types
 *
 * Type definitions for the homebis wallet dashboard page,
 * including transaction data, balance information, and UI state.
 *
 * @author bim
 * @version 1.0.0
 */

/**
 * Transaction types for the wallet dashboard
 */
export type TransactionType = 'credit' | 'debit';

/**
 * Transaction status indicators
 */
export type TransactionStatus = 'completed' | 'pending' | 'failed';

/**
 * Supported currencies
 */
export type Currency = 'EUR' | 'USD' | 'BTC' | 'ETH' | 'STRK';

/**
 * Individual transaction record
 */
export interface Transaction {
	/** Unique transaction identifier */
	id: string;

	/** Human-readable transaction description */
	description: string;

	/** Transaction date in human-readable format */
	date: string;

	/** Transaction amount (positive for credits, negative for debits) */
	amount: number;

	/** Transaction type */
	type: TransactionType;

	/** Current transaction status */
	status: TransactionStatus;

	/** Optional transaction hash for blockchain transactions */
	txHash?: string;

	/** Optional network/chain identifier */
	network?: string;

	/** Optional fee information */
	fee?: number;
}

/**
 * Wallet balance information
 */
export interface WalletBalance {
	/** Current balance amount */
	amount: number;

	/** Currency code */
	currency: Currency;

	/** Last updated timestamp */
	lastUpdated: Date;

	/** Optional USD equivalent value */
	usdValue?: number;
}

/**
 * User profile information for dashboard display
 */
export interface DashboardUser {
	/** User's display name */
	username: string;

	/** User's Starknet account address */
	starknetAddress?: string;

	/** User's preferred currency */
	preferredCurrency?: Currency;

	/** Account verification status */
	isVerified: boolean;
}

/**
 * Dashboard state interface
 */
export interface DashboardState {
	/** Current wallet balance */
	balance: WalletBalance;

	/** Recent transactions list */
	transactions: Transaction[];

	/** Loading state indicators */
	loading: {
		balance: boolean;
		transactions: boolean;
		actions: boolean;
	};

	/** Error states */
	errors: {
		balance?: string;
		transactions?: string;
		actions?: string;
	};
}

/**
 * Currency conversion rate information
 */
export interface CurrencyRate {
	/** Source currency */
	from: Currency;

	/** Target currency */
	to: Currency;

	/** Exchange rate */
	rate: number;

	/** Rate timestamp */
	timestamp: Date;

	/** Rate provider/source */
	source: string;
}

/**
 * Quick action types available on dashboard
 */
export type QuickActionType = 'receive' | 'pay' | 'swap' | 'history';

/**
 * Quick action configuration
 */
export interface QuickAction {
	/** Action type identifier */
	type: QuickActionType;

	/** Display label */
	label: string;

	/** Icon identifier (emoji or icon name) */
	icon: string;

	/** Navigation URL */
	href: string;

	/** Whether action is enabled */
	enabled: boolean;

	/** Optional badge count (for notifications) */
	badge?: number;
}

/**
 * Transaction category for grouping and filtering
 */
export type TransactionCategory = 'payment' | 'receive' | 'swap' | 'fee' | 'reward' | 'other';

/**
 * Extended transaction interface with additional metadata
 */
export interface ExtendedTransaction extends Transaction {
	/** Transaction category */
	category: TransactionCategory;

	/** Optional memo/note */
	memo?: string;

	/** Counterparty information */
	counterparty?: {
		name?: string;
		address?: string;
		type: 'user' | 'contract' | 'exchange' | 'unknown';
	};

	/** Asset information for multi-asset wallets */
	asset?: {
		symbol: string;
		name: string;
		decimals: number;
		contractAddress?: string;
	};
}

/**
 * Dashboard configuration options
 */
export interface DashboardConfig {
	/** Number of transactions to display */
	transactionLimit: number;

	/** Auto-refresh interval in milliseconds */
	refreshInterval: number;

	/** Default currency */
	defaultCurrency: Currency;

	/** Enable real-time updates */
	realTimeUpdates: boolean;

	/** Show balance in multiple currencies */
	multiCurrencyDisplay: boolean;
}

/**
 * Notification types for dashboard alerts
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * Dashboard notification interface
 */
export interface DashboardNotification {
	/** Unique notification ID */
	id: string;

	/** Notification type */
	type: NotificationType;

	/** Notification title */
	title: string;

	/** Notification message */
	message: string;

	/** Whether notification can be dismissed */
	dismissible: boolean;

	/** Auto-dismiss timeout in milliseconds */
	timeout?: number;

	/** Action button configuration */
	action?: {
		label: string;
		handler: () => void;
	};
}
