import { getAtomiqService } from '$lib/services/server/atomiq';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface UnsignedTransactionsResponse {
	success: boolean;
	swapId: string;
	phase: 'commit' | 'claim' | 'commit-and-claim';
	transactions: Array<{
		type: string;
		tx: any;
		details?: any;
	}>;
	message: string;
}

const getUnsignedTransactionsHandler = async ({ params, request }: RequestEvent) => {
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

	logger.info('Getting unsigned transactions for swap', { swapId });

	try {
		// Get unsigned transactions from the Atomiq service
		const result = await getAtomiqService().getUnsignedTransactions(swapId);

		if (!result.success) {
			return createErrorResponse(ApiErrorCode.SWAP_FAILED, result.message, {
				swapId
			});
		}

		const response: UnsignedTransactionsResponse = {
			success: true,
			swapId,
			phase: result.phase,
			transactions: result.transactions,
			message: result.message
		};

		return createSuccessResponse(response);
	} catch (error) {
		logger.error('Failed to get unsigned transactions', error as Error, {
			swapId
		});
		return createErrorResponse(ApiErrorCode.INTERNAL_ERROR, 'Failed to get unsigned transactions', {
			swapId
		});
	}
};

export const POST: RequestHandler = withErrorHandling(
	getUnsignedTransactionsHandler,
	'/api/lightning/get-unsigned-txns/[swapId]'
);
