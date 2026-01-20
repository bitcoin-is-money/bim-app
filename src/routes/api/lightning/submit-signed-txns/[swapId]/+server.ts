import { getAtomiqService } from '$lib/services/server/atomiq';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { triggerScanAfterStarknetSwap } from '$lib/utils/transaction-completion';
import { logger } from '$lib/utils/logger';
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface SubmitSignedTransactionsRequest {
	phase: 'commit' | 'claim' | 'commit-and-claim';
	signedTransactions: Array<{
		type: string;
		txHash: string;
		tx: any;
		details?: any;
	}>;
}

interface SubmitSignedTransactionsResponse {
	success: boolean;
	swapId: string;
	phase: string;
	txHash?: string;
	message: string;
}

const submitSignedTransactionsHandler = async ({ params, request }: RequestEvent) => {
	const { swapId } = params;

	if (!swapId) {
		return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Missing swap ID', { swapId }, [
			{
				field: 'swapId',
				message: 'Swap ID is required',
				code: 'MISSING_SWAP_ID'
			}
		]);
	}

	let requestBody: SubmitSignedTransactionsRequest;
	try {
		requestBody = await request.json();
	} catch (error) {
		return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Invalid request body', { swapId });
	}

	if (!requestBody.phase || !requestBody.signedTransactions) {
		return createErrorResponse(
			ApiErrorCode.VALIDATION_ERROR,
			'Missing required fields: phase and signedTransactions',
			{ swapId }
		);
	}

	logger.info('Submitting signed transactions', {
		swapId,
		phase: requestBody.phase,
		transactionCount: requestBody.signedTransactions.length
	});

	try {
		// Submit signed transactions to the Atomiq service
		const result = await getAtomiqService().submitSignedTransactions(
			swapId,
			requestBody.phase,
			requestBody.signedTransactions
		);

		if (!result.success) {
			return createErrorResponse(ApiErrorCode.SWAP_FAILED, result.message, {
				swapId
			});
		}

		const response: SubmitSignedTransactionsResponse = {
			success: true,
			swapId,
			phase: requestBody.phase,
			txHash: result.txHash ?? undefined,
			message: result.message
		};

		// Trigger immediate blockchain scanning after successful Starknet to Lightning swap transaction
		if (result.txHash) {
			triggerScanAfterStarknetSwap(result.txHash, swapId, undefined, {
				phase: requestBody.phase,
				transactionCount: requestBody.signedTransactions.length,
				submittedAt: new Date().toISOString()
			}).catch((error) => {
				logger.warn('Failed to trigger blockchain scan after Starknet to Lightning swap', {
					swapId,
					transactionHash: result.txHash,
					phase: requestBody.phase,
					error: error.message
				});
			});
		}

		return createSuccessResponse(response);
	} catch (error) {
		logger.error('Failed to submit signed transactions', error as Error, {
			swapId
		});
		return createErrorResponse(
			ApiErrorCode.INTERNAL_ERROR,
			'Failed to submit signed transactions',
			{ swapId }
		);
	}
};

export const POST: RequestHandler = withErrorHandling(
	submitSignedTransactionsHandler,
	'/api/lightning/submit-signed-txns/[swapId]'
);
