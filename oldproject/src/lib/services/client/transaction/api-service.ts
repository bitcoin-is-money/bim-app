import { logger } from '$lib/utils/logger';
import type { TransactionPhase, UnsignedTransaction, SignedTransaction } from './types';

/**
 * Transaction API service responsible for communication with transaction endpoints
 */
export class TransactionApiService {
	/**
	 * Get unsigned transactions from server
	 */
	async getUnsignedTransactions(swapId: string): Promise<TransactionPhase> {
		try {
			console.log('🌐 Making API call to getUnsignedTransactions:', {
				swapId,
				url: `/api/lightning/get-unsigned-txns/${swapId}`
			});

			const response = await fetch(`/api/lightning/get-unsigned-txns/${swapId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.text();
				const error = new Error(
					`Failed to get unsigned transactions: ${response.status} ${errorData}`
				);
				(error as any).swapId = swapId;
				throw error;
			}

			const result = await response.json();
			console.log('🔍 API Response for getUnsignedTransactions:', {
				swapId,
				responseStatus: response.status,
				result,
				hasData: !!result.data,
				dataKeys: result.data ? Object.keys(result.data) : []
			});
			return result.data;
		} catch (error) {
			logger.error('Failed to get unsigned transactions', error as Error, {
				swapId
			});
			throw error;
		}
	}

	/**
	 * Get unsigned claim transactions from server
	 */
	async getUnsignedClaimTransactions(swapId: string): Promise<UnsignedTransaction[]> {
		try {
			const response = await fetch(`/api/lightning/get-unsigned-claim-txns/${swapId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(
					`Failed to get unsigned claim transactions: ${response.status} ${errorData}`
				);
			}

			const result = await response.json();
			return result.data.transactions;
		} catch (error) {
			logger.error('Failed to get unsigned claim transactions', error as Error, { swapId });
			throw error;
		}
	}

	/**
	 * Submit signed transactions to server
	 */
	async submitSignedTransactions(
		swapId: string,
		phase: 'commit' | 'claim' | 'commit-and-claim',
		signedTransactions: SignedTransaction[]
	): Promise<{ success: boolean; txHash?: string; message: string }> {
		try {
			logger.info('Submitting signed transactions', {
				swapId,
				phase,
				transactionCount: signedTransactions.length
			});

			const response = await fetch(`/api/lightning/submit-signed-txns/${swapId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					phase,
					signedTransactions
				})
			});

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`Failed to submit signed transactions: ${response.status} ${errorData}`);
			}

			const result = await response.json();

			logger.info('Signed transactions submitted successfully', {
				swapId,
				phase,
				success: result.success,
				txHash: result.data?.txHash
			});

			return {
				success: result.success,
				txHash: result.data?.txHash,
				message: result.message || 'Transactions submitted successfully'
			};
		} catch (error) {
			logger.error('Failed to submit signed transactions', error as Error, {
				swapId,
				phase
			});
			throw error;
		}
	}
}
