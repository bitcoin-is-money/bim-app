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

interface UnsignedClaimTransactionsResponse {
	success: boolean;
	swapId: string;
	transactions: Array<{
		type: string;
		tx: any;
		details?: any;
	}>;
	message: string;
}

const getUnsignedClaimTransactionsHandler = async ({ params, request }: RequestEvent) => {
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

	logger.info('Getting unsigned claim transactions for swap', { swapId });

	try {
		// Get unsigned claim transactions from the Atomiq service
		const result = await getAtomiqService().getUnsignedClaimTransactions(swapId);

		if (!result.success) {
			return createErrorResponse(ApiErrorCode.SWAP_FAILED, result.message, {
				swapId
			});
		}

		const response: UnsignedClaimTransactionsResponse = {
			success: true,
			swapId,
			transactions: result.transactions,
			message: result.message
		};

		return createSuccessResponse(response);
	} catch (error) {
		logger.error('Failed to get unsigned claim transactions', error as Error, {
			swapId
		});
		return createErrorResponse(
			ApiErrorCode.INTERNAL_ERROR,
			'Failed to get unsigned claim transactions',
			{ swapId }
		);
	}
};

export const POST: RequestHandler = withErrorHandling(
	getUnsignedClaimTransactionsHandler,
	'/api/lightning/get-unsigned-claim-txns/[swapId]'
);
