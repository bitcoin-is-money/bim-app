/**
 * @fileoverview Lightning Swap Claim Endpoint
 *
 * This endpoint handles the claiming of Lightning Network swaps after payment
 * has been received. It waits for payment confirmation and then claims the
 * funds to the specified Starknet address.
 *
 * Key Features:
 * - Waits for Lightning payment confirmation
 * - Claims funds to Starknet using the Atomiq SDK
 * - Proper error handling with timeout management
 * - Real-time status updates
 *
 * @requires @sveltejs/kit - SvelteKit framework
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/server/services/atomiq.service - Atomiq service
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { PublicEnv } from '$lib/config/env';
import { WEBAUTHN_CONFIG } from '$lib/constants';
import { triggerScanAfterLightningSwap } from '$lib/utils/transaction-completion';
import { logger } from '$lib/utils/logger';
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ClaimSwapResponse {
	success: boolean;
	swapId: string;
	txHash?: string | undefined;
	message: string;
	claimedAt: string;
}

const claimSwapHandler = async ({ params, request }: RequestEvent) => {
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

	logger.info('Claiming Lightning swap', { swapId });

	try {
		// Get current user from session to access WebAuthn credentials
		const { getSessionId, validateSession } = await import('$lib/auth/session');
		const { WebauthnService } = await import('$lib/services/client/webauthn.client.service');
		const { env } = await import('$env/dynamic/public');

		// Get session ID from cookies
		const sessionId = getSessionId({ request } as any);
		if (!sessionId) {
			return createErrorResponse(ApiErrorCode.UNAUTHORIZED, 'User not authenticated', { swapId });
		}

		// Validate session and get user
		const userData = await validateSession(sessionId);
		if (!userData) {
			return createErrorResponse(ApiErrorCode.UNAUTHORIZED, 'Invalid or expired session', {
				swapId
			});
		}

		if (!userData?.credentialId || !userData?.publicKey) {
			return createErrorResponse(ApiErrorCode.UNAUTHORIZED, 'User missing WebAuthn credentials', {
				swapId
			});
		}

		// Create WebAuthn signer from stored credentials
		const webauthnService = WebauthnService.getInstance();
		const rpId = PublicEnv.WEBAUTHN_RP_ID();
		const origin = rpId === 'localhost' ? `http://${rpId}` : `https://${rpId}`;

		const signer = webauthnService.createOwnerFromStoredCredentials(
			rpId,
			origin,
			userData.credentialId,
			userData.publicKey
		);

		logger.info('Created WebAuthn signer from stored credentials', {
			swapId,
			hasSigner: !!signer,
			userId: userData.id
		});

		// This will wait for payment and then claim the swap with signer
		const result = await getAtomiqService().claimLightningSwap(swapId, signer);

		const response: ClaimSwapResponse = {
			success: result.success,
			swapId,
			txHash: result.txHash,
			message: result.message,
			claimedAt: new Date().toISOString()
		};

		if (result.success) {
			logger.info('Lightning swap claimed successfully', {
				swapId,
				txHash: result.txHash
			});

			// Trigger immediate blockchain scanning after successful Lightning to Starknet swap claim
			if (result.txHash) {
				triggerScanAfterLightningSwap(result.txHash, swapId, undefined, {
					claimedAt: response.claimedAt
				}).catch((error) => {
					logger.warn('Failed to trigger blockchain scan after Lightning to Starknet swap claim', {
						swapId,
						transactionHash: result.txHash,
						error: error.message
					});
				});
			}

			return createSuccessResponse(response);
		} else {
			logger.warn('Lightning swap claim failed', {
				swapId,
				message: result.message
			});
			return createErrorResponse(ApiErrorCode.SWAP_FAILED, result.message, {
				swapId,
				claimedAt: response.claimedAt
			});
		}
	} catch (error) {
		logger.error('Failed to claim Lightning swap', error as Error, { swapId });

		// Handle specific error types
		if (error instanceof Error) {
			if (error.message.includes('not found')) {
				return createErrorResponse(ApiErrorCode.SWAP_NOT_FOUND, 'Swap not found or expired', {
					swapId
				});
			}
			if (error.message.includes('payment not received')) {
				return createErrorResponse(
					ApiErrorCode.PAYMENT_TIMEOUT,
					'Lightning payment was not received in time',
					{ swapId }
				);
			}
		}

		return createErrorResponse(ApiErrorCode.INTERNAL_ERROR, 'Failed to claim Lightning swap', {
			swapId,
			originalError: (error as Error).message
		});
	}
};

export const POST: RequestHandler = withErrorHandling(
	claimSwapHandler,
	'/api/lightning/claim-swap'
);
