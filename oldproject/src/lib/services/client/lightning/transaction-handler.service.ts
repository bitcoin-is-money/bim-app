/**
 * @fileoverview Lightning Transaction Handler Service
 *
 * Handles transaction confirmation and submission for Lightning operations.
 */

import { logger } from '$lib/utils/logger';
import type { UnsignedTransaction } from '$lib/services/client/client-transaction.service';

/**
 * Transaction phase types
 */
export type TransactionPhase = 'commit' | 'claim' | 'commit-and-claim';

/**
 * Transaction handling result
 */
export interface TransactionResult {
	success: boolean;
	message: string;
	txHash?: string;
}

/**
 * Service for handling Lightning transaction operations
 */
export class TransactionHandlerService {
	private static instance: TransactionHandlerService;

	static getInstance(): TransactionHandlerService {
		if (!TransactionHandlerService.instance) {
			TransactionHandlerService.instance = new TransactionHandlerService();
		}
		return TransactionHandlerService.instance;
	}

	/**
	 * Submit signed transactions for a Lightning swap
	 */
	async submitSignedTransactions(
		swapId: string,
		phase: TransactionPhase,
		signedTransactions: any[]
	): Promise<TransactionResult> {
		try {
			// Import the client transaction service
			const { ClientTransactionService } = await import(
				'$lib/services/client/client-transaction.service'
			);
			const clientTransactionService = ClientTransactionService.getInstance();

			const result = await clientTransactionService.submitSignedTransactions(
				swapId,
				phase,
				signedTransactions
			);

			if (result.success) {
				logger.info(`${phase} transactions submitted successfully!`, result);
				return {
					success: true,
					message: `${phase} transactions submitted successfully!`,
					txHash: result.txHash
				};
			} else {
				logger.error(`${phase} transaction submission failed:`, result);
				return {
					success: false,
					message: `${phase} transaction submission failed: ${result.message}`
				};
			}
		} catch (error) {
			const errorMsg = `${phase} transaction error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			logger.error(`${phase} transaction error:`, error);
			return {
				success: false,
				message: errorMsg
			};
		}
	}

	/**
	 * Get unsigned transactions for a swap
	 */
	async getUnsignedTransactions(swapId: string): Promise<{
		success: boolean;
		transactions: UnsignedTransaction[];
		message?: string;
	}> {
		try {
			const { ClientTransactionService } = await import(
				'$lib/services/client/client-transaction.service'
			);
			const clientTransactionService = ClientTransactionService.getInstance();

			const result = await clientTransactionService.getUnsignedTransactions(swapId);
			return result;
		} catch (error) {
			const errorMsg = `Failed to get unsigned transactions: ${error instanceof Error ? error.message : 'Unknown error'}`;
			logger.error('Failed to get unsigned transactions:', error);
			return {
				success: false,
				transactions: [],
				message: errorMsg
			};
		}
	}

	/**
	 * Validate transaction phase
	 */
	isValidPhase(phase: string): phase is TransactionPhase {
		return ['commit', 'claim', 'commit-and-claim'].includes(phase);
	}
}

// Export singleton instance
export const transactionHandlerService = TransactionHandlerService.getInstance();
