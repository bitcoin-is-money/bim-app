/**
 * @fileoverview User Transaction Service
 *
 * Client-side service for fetching and managing user transaction data.
 * Integrates with the transaction indexing API to provide real-time
 * transaction history for the user's registered addresses.
 *
 * @author bim
 * @version 1.0.0
 */

import type { Transaction } from '$lib/types/wallet-dashboard';
import { CACHE_TTL } from '$lib/constants';
import type { UserTransaction } from '$lib/db';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

/**
 * API Response structure for user transactions endpoint
 */
export interface UserTransactionApiResponse {
	success: boolean;
	transactions: UserTransactionWithAddress[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}

/**
 * User transaction with associated address information
 */
export interface UserTransactionWithAddress extends UserTransaction {
	starknetAddress: string;
	addressType: string;
}

/**
 * Options for fetching user transactions
 */
export interface FetchTransactionsOptions {
	limit?: number;
	offset?: number;
	address?: string;
	type?: 'receipt' | 'spent';
}

/**
 * User Transaction Service
 */
export class UserTransactionService {
	private static instance: UserTransactionService | null = null;
	private cache: Map<string, { data: Transaction[]; timestamp: number }> = new Map();
	private readonly CACHE_DURATION = CACHE_TTL.USER_TRANSACTIONS; // 30 seconds cache

	/**
	 * Get singleton instance
	 */
	static getInstance(): UserTransactionService {
		if (!UserTransactionService.instance) {
			UserTransactionService.instance = new UserTransactionService();
		}
		return UserTransactionService.instance;
	}

	/**
	 * Fetch user transactions from the API
	 */
	async fetchUserTransactions(options: FetchTransactionsOptions = {}): Promise<Transaction[]> {
		const { limit = 50, offset = 0, address, type } = options;

		// Create cache key
		const cacheKey = `transactions:${limit}:${offset}:${address || 'all'}:${type || 'all'}`;

		// Check cache first
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
			return cached.data;
		}

		try {
			// Build query parameters
			const searchParams = new URLSearchParams();
			searchParams.set('limit', limit.toString());
			searchParams.set('offset', offset.toString());

			if (address) {
				searchParams.set('address', address);
			}

			if (type) {
				searchParams.set('type', type);
			}

			// Make API request
			const response = await fetch(`/api/user/transactions?${searchParams.toString()}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch transactions: ${response.status} ${response.statusText}`);
			}

			const result: UserTransactionApiResponse = await response.json();

			if (!result.success) {
				throw new Error('API returned failure status');
			}

			// Transform database format to dashboard format
			const transactions = result.transactions.map((tx) => this.transformTransaction(tx));

			// Cache the results
			this.cache.set(cacheKey, {
				data: transactions,
				timestamp: Date.now()
			});

			return transactions;
		} catch (error) {
			console.error('Error fetching user transactions:', error);
			throw error;
		}
	}

	/**
	 * Fetch the most recent transactions (shorthand method)
	 */
	async getRecentTransactions(count: number = 5): Promise<Transaction[]> {
		return this.fetchUserTransactions({ limit: count, offset: 0 });
	}

	/**
	 * Parse amount string that could be in hex or decimal format
	 */
	private parseAmount(amountStr: string): number {
		if (!amountStr) {
			console.debug('parseAmount: Empty amount string, returning 0');
			return 0;
		}

		try {
			// Check if it's a hex string (starts with 0x or is all hex digits)
			if (amountStr.startsWith('0x') || /^[0-9a-fA-F]+$/.test(amountStr)) {
				const hexAmount = amountStr.startsWith('0x') ? amountStr : `0x${amountStr}`;
				const bigIntValue = BigInt(hexAmount);
				const numberValue = Number(bigIntValue);

				console.debug(
					`parseAmount: Parsed hex amount "${amountStr}" -> BigInt(${bigIntValue.toString()}) -> Number(${numberValue})`
				);
				return numberValue;
			}

			// Otherwise treat as decimal string
			const decimalValue = parseFloat(amountStr);
			console.debug(`parseAmount: Parsed decimal amount "${amountStr}" -> ${decimalValue}`);
			return decimalValue;
		} catch (error) {
			console.warn(`Failed to parse amount "${amountStr}":`, error);
			return 0;
		}
	}

	/**
	 * Transform database transaction to dashboard transaction format
	 */
	private transformTransaction(dbTransaction: UserTransactionWithAddress): Transaction {
		// Convert amount from string to number (handles both hex and decimal formats)
		const amount = this.parseAmount(dbTransaction.amount);

		// Determine transaction type and adjust amount sign
		const isCredit = dbTransaction.transactionType === 'receipt';
		const adjustedAmount = isCredit ? Math.abs(amount) : -Math.abs(amount);

		console.debug(
			`transformTransaction: TX ${dbTransaction.transactionHash.substring(0, 10)}... - Type: ${dbTransaction.transactionType}, Raw: "${dbTransaction.amount}", Parsed: ${amount}, Final: ${adjustedAmount}`
		);

		// Simple transaction descriptions
		const description = isCredit
			? get(_)('client.transaction.received')
			: get(_)('client.transaction.sent');

		// Format date in a human-readable format
		const date = this.formatTransactionDate(dbTransaction.timestamp);

		return {
			id: dbTransaction.id,
			description,
			date,
			amount: adjustedAmount,
			type: isCredit ? 'credit' : 'debit',
			status: 'completed', // All indexed transactions are considered completed
			txHash: dbTransaction.transactionHash,
			network: 'starknet'
			// Fee information not available in current schema, could be added later
		};
	}

	/**
	 * Format transaction timestamp to human-readable date
	 */
	private formatTransactionDate(timestamp: Date): string {
		const date = new Date(timestamp);
		const now = new Date();

		// Check if it's today
		if (date.toDateString() === now.toDateString()) {
			return get(_)('client.transaction.today');
		}

		// Check if it's yesterday
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (date.toDateString() === yesterday.toDateString()) {
			return get(_)('client.transaction.yesterday');
		}

		// Check if it's within the last week
		const weekAgo = new Date(now);
		weekAgo.setDate(weekAgo.getDate() - 7);
		if (date > weekAgo) {
			return date.toLocaleDateString('en-US', { weekday: 'long' });
		}

		// For older transactions, show full date
		return date.toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	/**
	 * Clear cached transaction data
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cached transaction count (for debugging)
	 */
	getCacheSize(): number {
		return this.cache.size;
	}
}

/**
 * Export singleton instance for convenience
 */
export const userTransactionService = UserTransactionService.getInstance();
